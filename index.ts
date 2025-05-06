import * as pulumi from "@pulumi/pulumi";
import { githubRoleArn } from "./modules/iam/githubActionsRole";
import { taskRoleArn } from "./modules/iam/taskDefinitionRole";
import { ECRRepos } from "./modules/ecr/ecr";

const config = new pulumi.Config();
const env = config.require("environment");
let network: any = undefined;

// export const myGithubRoleArn = githubRoleArn;
// export const myTaskRoleArn = taskRoleArn;

if (env === "dev") {
  network = require("./modules/vpc/networkDev");
} else if (env === "prod") {
  network = require("./modules/vpc/networkProd");
}

export const vpcId = network.vpc.id;
export const publicSubnetsIds = network.publicSubnets.map((subnet: any) => subnet.id);


// export const ecrRepoUrls = ECRRepos.map((repo) => repo.repositoryUrl);
