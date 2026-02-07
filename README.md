# AWS CDK TypeScript Website Infrastructure

This project deploys a scalable website infrastructure on AWS using CDK in TypeScript.

## Architecture

- VPC with public and private subnets across 2 availability zones
- Application Load Balancer (ALB) in public subnets
- Auto Scaling Group with EC2 instances in private subnets
- Bastion host for SSH access
- Security groups for network isolation

## Prerequisites

- Node.js 18+ and npm
- AWS CLI configured with credentials
- AWS CDK CLI: `npm install -g aws-cdk`

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Configure AWS credentials (if not already done):
```bash
aws configure
```

3. Bootstrap CDK in your AWS account (first time only):
```bash
npx cdk bootstrap
```

4. Deploy the stack:
```bash
npm run deploy
```

## Access Your Website

After deployment completes, look for the output:
```
Outputs:
WebsiteStack.LoadBalancerDNS = WebsiteStack-WebsiteALB-XXXXXXXXX.region.elb.amazonaws.com
```

Open that URL in your browser to see your website!

## Available Commands

- `npm run build` - Compile TypeScript
- `npm run watch` - Watch for changes and compile
- `npm run deploy` - Build and deploy the stack
- `npm run synth` - Synthesize CloudFormation template
- `npm run diff` - Compare deployed stack with current state
- `npm run destroy` - Delete all resources

## Project Structure

```
├── bin/
│   └── app.ts              # CDK app entry point
├── lib/
│   └── website-stack.ts    # Main stack definition
├── cdk.json                # CDK configuration
├── package.json            # Node.js dependencies
└── tsconfig.json           # TypeScript configuration
```

## Outputs

After deployment, you'll get:
- Load Balancer DNS name (access your website here)
- Bastion Host Instance ID
- VPC ID

## Troubleshooting

If you get authentication errors:
- Make sure AWS CLI is configured: `aws sts get-caller-identity`
- Check your credentials in `~/.aws/credentials`

If deployment fails:
- Check you have sufficient AWS permissions
- Verify your account has been bootstrapped: `cdk bootstrap`
