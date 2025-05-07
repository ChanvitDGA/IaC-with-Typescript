import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { githubRoleArn } from "./modules/iam/githubActionsRole";
import { taskRoleArn } from "./modules/iam/taskDefinitionRole";
import { ECRRepos } from "./modules/ecr/ecr";

const config = new pulumi.Config();
const env = config.require("environment");
const network = require(`./modules/vpc/network${env.charAt(0).toUpperCase() + env.slice(1)}`);

// export const myGithubRoleArn = githubRoleArn;
// export const myTaskRoleArn = taskRoleArn;

export const vpcId = network.vpc.id;
export const publicSubnetsIds = network.publicSubnets.map((subnet: any) => subnet.id);
export const defaultSecurityGroupId = pulumi.output(network.defaultSg).apply(sg => sg.id);


// export const ecrRepoUrls = ECRRepos.map((repo) => repo.repositoryUrl);
