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
const databaseSubnetsCidr  = ["10.0.7.0/24", "10.0.8.0/24", "10.0.9.0/24"]
const azs = ["a", "b", "c"].map(suffix => `${region}${suffix}`);
const privateSubnetNames = [
  "miniapps-private-ap-southeast-1a",
  "miniapps-private-ap-southeast-1b",
  "miniapps-private-ap-southeast-1c",
  "miniapps-container-ap-southeast-1a",
  "miniapps-container-ap-southeast-1b",
  "miniapps-container-ap-southeast-1c",
];

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
const databaseSubnets = databaseSubnetsCidr.map(
  (cidr, i) => {
    return new aws.ec2.Subnet(`db-subnet-${i}`, {
      vpcId: vpc.id,
      cidrBlock: cidr,
      availabilityZone: azs[i],
      tags: {
        Name: `${name}-db-${azs[i]}`,
      },
    });
  }
);

// === Internet Gateway สำหรับ Public Subnet ===
const igw = new aws.ec2.InternetGateway(`${name}-igw`, {
  vpcId: vpc.id,
  tags: {
    Name: `${name}`,
    ENVIRONMENT: env,
  },
});

// === Elastic IP สำหรับ NAT Gateway ===
const eip = new aws.ec2.Eip("nat-eip", {
  domain: "vpc",
});

// === NAT Gateway (Single NAT) ===
const natGw = new aws.ec2.NatGateway("nat-gw", {
  allocationId: eip.id,
  subnetId: publicSubnets[0].id, // ใช้ public subnet แรก
  tags: {
    Name: `${name}-${azs[0]}`,
  },
});

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
    Name: `${name}-public`
  },
});

publicSubnets.forEach((subnet, i) => {
  new aws.ec2.RouteTableAssociation(`public-rt-assoc-${i}`, {
    subnetId: subnet.id,
    routeTableId: publicRt.id,
  });
});

// Private route table (NAT Gateway)
const privateRt = new aws.ec2.RouteTable("private-rt", {
  vpcId: vpc.id,
  routes: [
    {
      cidrBlock: "0.0.0.0/0",
      natGatewayId: natGw.id,
    },
  ],
  tags: {
    Name: `${name}-private`,
  },
});

privateSubnets.forEach((subnet, i) => {
  new aws.ec2.RouteTableAssociation(`private-rt-assoc-${i}`, {
    subnetId: subnet.id,
    routeTableId: privateRt.id,
  });
});

databaseSubnets.forEach((subnet, i) => {
  new aws.ec2.RouteTableAssociation(`${name}-db-rt-assoc-${i}`, {
    subnetId: subnet.id,
    routeTableId: privateRt.id,
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

export { vpc, natGw, publicSubnets, privateSubnets, databaseSubnets };
