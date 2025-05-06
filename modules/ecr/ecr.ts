import * as aws from "@pulumi/aws";

const env = process.env.NODE_ENV || "dev";
const CostCenter = "IT";
const ecrRepoName = [
  "miniapps-disloan-api-dev",
  "miniapps-disloan-api-uat",
  "miniapps-disloan-frontend-dev",
  "miniapps-disloan-frontend-uat",
  "miniapps-hoslicense-frontend",
];

// สร้าง ECR repository
const ECRRepos = ecrRepoName.map((repoName) => {
  return new aws.ecr.Repository(repoName, {
    name: repoName,
    imageScanningConfiguration: {
      scanOnPush: true,
    },
    imageTagMutability: "MUTABLE",
    tags: {
        Name: repoName,
        ENVIRONMENT: env.charAt(0).toUpperCase() + env.slice(1),
        CostCenter: CostCenter
    }
  });
});

// สร้าง lifecycle policy: เก็บแค่ 5 อันล่าสุด
const lifecyclePolicies = ECRRepos.map((repo, index) => {
  return new aws.ecr.LifecyclePolicy(`${repo.name}-lifecycle-policy-${index}`, {
    repository: repo.name,
    policy: JSON.stringify({
      rules: [
        {
          rulePriority: 1,
          description: "Keep last 5 images",
          selection: {
            tagStatus: "any",
            countType: "imageCountMoreThan",
            countNumber: 5,
          },
          action: {
            type: "expire",
          },
        },
      ],
    }),
  });
});

export { ECRRepos, lifecyclePolicies };