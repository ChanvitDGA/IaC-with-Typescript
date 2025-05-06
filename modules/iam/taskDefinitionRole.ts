import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();
const env = config.require("environment");

const taskRoleName = "task-definition-test-role";
const taskRoleDescription = "Task Definition Role for Pulumi";

// กำหนด policy ให้ role github
const policies = [
  "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess",
  "arn:aws:iam::aws:policy/service-role/AmazonElasticCacheFullAccess",
  "arn:aws:iam::aws:policy/service-role/CloudWatchLogsFullAccess",
  "arn:aws:iam::aws:policy/service-role/SecretsManagerReadWrite",
];

const taskDefinitionRole = new aws.iam.Role(`${taskRoleName}-${env}`, {
  name: taskRoleName,
  description: taskRoleDescription,
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: {
          Service: "ecs-tasks.amazonaws.com",
        },
        Action: "sts:AssumeRole",
      },
    ],
  }),
});

const attachments = policies.map((policyArn, index) => {
  return new aws.iam.RolePolicyAttachment(`attach-policy-task-${index}`, {
    role: taskDefinitionRole.name,
    policyArn: policyArn,
  });
});

export const taskRoleArn = taskDefinitionRole.arn;
