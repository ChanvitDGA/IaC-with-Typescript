import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

// กำหนด environment
const config = new pulumi.Config();
const env = config.require("environment");

// กำหนดค่า
const region = "ap-southeast-1";
const name = `miniapps-${env}`;
const cidrBlock = "10.0.0.0/16";
const secondaryCidrBlocks = "100.64.0.0/16";
const publicSubnetsCidr = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"];
const privateSubnetsCidr = [
  "10.0.4.0/24",
  "10.0.5.0/24",
  "10.0.6.0/24",
  "100.64.0.0/20",
  "100.64.16.0/20",
  "100.64.32.0/20",
];
const databaseSubnetsCidr = ["10.0.7.0/24", "10.0.8.0/24", "10.0.9.0/24"];
const azs = ["a", "b", "c"].map((suffix) => `${region}${suffix}`);
const privateSubnetNames = [
  "miniapps-private-ap-southeast-1a",
  "miniapps-private-ap-southeast-1b",
  "miniapps-private-ap-southeast-1c",
  "miniapps-container-ap-southeast-1a",
  "miniapps-container-ap-southeast-1b",
  "miniapps-container-ap-southeast-1c",
];
const targetGroupPort = 80;
const ListenerPort = [80, 443];

// สร้าง VPC
const vpc = new aws.ec2.Vpc(`${name}-vpc`, {
  cidrBlock: cidrBlock,
  enableDnsHostnames: true,
  enableDnsSupport: true,
  tags: { Name: `${name}`, ENVIRONMENT: env },
});

// เพิ่ม Secondary CIDR Block
const secondaryCidr = new aws.ec2.VpcIpv4CidrBlockAssociation(
  `${name}-secondary-cidr`,
  {
    vpcId: vpc.id,
    cidrBlock: secondaryCidrBlocks,
  }
);

// === Public Subnets ===
const publicSubnets = publicSubnetsCidr.map((cidr, index) => {
  return new aws.ec2.Subnet(`${name}-public-subnet-${index}`, {
    vpcId: vpc.id,
    cidrBlock: cidr,
    availabilityZone: azs[index],
    tags: {
      Name: `${name}-public-${azs[index]}`,
      ENVIRONMENT: env,
      "kubernetes.io/role/elb": "1",
    },
  });
});

// === Private Subnets ===
const privateSubnets = privateSubnetsCidr.map((cidr, index) => {
  return new aws.ec2.Subnet(
    `${name}-private-subnet-${index}`,
    {
      vpcId: vpc.id,
      cidrBlock: cidr,
      availabilityZone: azs[index % 3],
      tags: { Name: privateSubnetNames[index], ENVIRONMENT: env },
    },
    { dependsOn: secondaryCidr }
  );
});

// === Database Subnets ===
const databaseSubnets = databaseSubnetsCidr.map((cidr, i) => {
  return new aws.ec2.Subnet(`db-subnet-${i}`, {
    vpcId: vpc.id,
    cidrBlock: cidr,
    availabilityZone: azs[i],
    tags: {
      Name: `${name}-db-${azs[i]}`,
    },
  });
});

// === Internet Gateway สำหรับ Public Subnet ===
const igw = new aws.ec2.InternetGateway(`${name}-igw`, {
  vpcId: vpc.id,
  tags: {
    Name: `${name}`,
    ENVIRONMENT: env,
  },
});

// === Elastic IP สำหรับ NAT Gateway ===
const natEips: aws.ec2.Eip[] = azs.map(
  (az, i) =>
    new aws.ec2.Eip(`${name}-nat-eip-${az}`, {
      domain: "vpc",
    })
);

// === NAT Gateway (Single NAT) ===
const natGws: aws.ec2.NatGateway[] = azs.map(
  (az, i) =>
    new aws.ec2.NatGateway(`${name}-nat-gw-${az}`, {
      allocationId: natEips[i].id,
      subnetId: publicSubnets[i].id, // NAT ต้องอยู่ใน public subnet
      tags: {
        Name: `${name}-${az}`,
      },
    })
);

// === Routing Tables ===
// Public route table (Internet Gateway)
const publicRt = new aws.ec2.RouteTable("public-rt", {
  vpcId: vpc.id,
  routes: [
    {
      cidrBlock: "0.0.0.0/0",
      gatewayId: igw.id,
    },
  ],
  tags: {
    Name: `${name}-public`,
  },
});

publicSubnets.forEach((subnet, i) => {
  new aws.ec2.RouteTableAssociation(`public-rt-assoc-${i}`, {
    subnetId: subnet.id,
    routeTableId: publicRt.id,
  });
});

// Private route table (NAT Gateway)
const privateRouteTables = azs.map(
  (az, i) =>
    new aws.ec2.RouteTable(`${name}-private-rt-${az}`, {
      vpcId: vpc.id,
      routes: [
        {
          cidrBlock: "0.0.0.0/0",
          natGatewayId: natGws[i].id,
        },
      ],
      tags: {
        Name: `${name}-private-${az}`,
      },
    })
);

privateSubnets.forEach((subnet, i) => {
  subnet.availabilityZone.apply((az) => {
    const rtIndex = azs.indexOf(az); // หาว่าอยู่ใน AZ index ไหน
    if (rtIndex >= 0) {
      new aws.ec2.RouteTableAssociation(`${name}-private-rt-assoc-${i}`, {
        subnetId: subnet.id,
        routeTableId: privateRouteTables[rtIndex].id,
      });
    }
  });
});

databaseSubnets.forEach((subnet, i) => {
  subnet.availabilityZone.apply((az) => {
    const rtIndex = azs.indexOf(az); // หาว่าอยู่ใน AZ index ไหน
    if (rtIndex >= 0) {
      new aws.ec2.RouteTableAssociation(`${name}-db-rt-assoc-${i}`, {
        subnetId: subnet.id,
        routeTableId: privateRouteTables[rtIndex].id,
      });
    }
  });
});

// Default route table (VPC) สำหรับ Private Subnet
const defaultRouteTable = new aws.ec2.DefaultRouteTable(`${name}-default`, {
  defaultRouteTableId: vpc.defaultRouteTableId,
  tags: {
    Name: `${name}-default`,
    ENVIRONMENT: env,
  },
});

const defaultSg = aws.ec2.getSecurityGroupOutput({
  filters: [
    { name: "vpc-id", values: [vpc.id] },
    { name: "group-name", values: ["default"] },
  ],
});

const renamedDefaultSg = new aws.ec2.Tag("rename-default-sg", {
  resourceId: defaultSg.id,
  key: "Name",
  value: `${name}-default`,
});

// === Security Group ===
const lbSecurityGroup = new aws.ec2.SecurityGroup(`alb-${env}-sg`, {
  name: `alb-${env}-sg`,
  description: "Allow all traffic from anywhere",
  vpcId: vpc.id,
  ingress: [
    {
      protocol: "-1", // -1 = all protocols
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  egress: [
    {
      protocol: "-1",
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
});

// สร้าง Load Balancer
const alb = new aws.lb.LoadBalancer(`${name}-lb`, {
  name: `${name.split("-")[0]}-alb-${env}`,
  internal: false,
  loadBalancerType: "application",
  securityGroups: [lbSecurityGroup.id],
  subnets: publicSubnets.map((subnet) => subnet.id),
}, { dependsOn: [lbSecurityGroup] });

// // สร้าง Target Group
// const targetGroup = new aws.lb.TargetGroup(`${name}-tg`, {
//   port: targetGroupPort,
//   protocol: "HTTP",
//   vpcId: vpc.id,
//   targetType: "instance",
// });

// สร้าง Listener
const listener = ListenerPort.map((port) => {
  return new aws.lb.Listener(`${name}-listener-${port}`, {
    loadBalancerArn: alb.arn,
    port: port,
    protocol: "HTTP",
    defaultActions: [
      {
        type: "fixed-response",
        fixedResponse: {
          contentType: "application/json",
          messageBody: JSON.stringify({ statusCode: 404 }),
          statusCode: "404",
        },
      },
    ],
  });
});

export { vpc, publicSubnets, privateSubnets, databaseSubnets, defaultSg };
