import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();
const env = config.require("environment");

const accountId = "779846795588";
const repo = "ChanvitDGA/*";
const githubRoleName = "github-test-role";
const githubDescription = "GitHub Actions Role for Pulumi";

// กำหนด policy ให้ role github
const policies = [
  "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess",
];

// สร้าง OIDC provider
const githubProvider = aws.iam.OpenIdConnectProvider.get(
  "github-oidc",
  `arn:aws:iam::${accountId}:oidc-provider/token.actions.githubusercontent.com`
);

// สร้าง IAM Role สำหรับ GitHub Actions
const githubActionsRole = githubProvider.arn.apply(
  (arn) =>
    new aws.iam.Role(`${githubRoleName}-${env}`, {
      name: githubRoleName,
      description: githubDescription,
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              Federated: arn,
            },
            Action: "sts:AssumeRoleWithWebIdentity",
            Condition: {
              StringLike: {
                "token.actions.githubusercontent.com:sub": `repo:${repo}:*`,
              },
            },
          },
        ],
      }),
    })
);

// Attach policy ให้กับ role
const attachments = policies.map((policyArn, index) => {
  return new aws.iam.RolePolicyAttachment(`attach-policy-github-${index}`, {
    role: githubActionsRole.name,
    policyArn: policyArn,
  });
});

// Export ARN ของ Role เพื่อใช้ใน GitHub Actions
export const githubRoleArn = githubActionsRole.arn;
