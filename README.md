# Building Scalable Web Infrastructure on AWS with CDK

## Introduction

Infrastructure as Code (IaC) has revolutionized how we provision and manage cloud resources. In our [previous blog post](https://github.com/yourusername/aws-cdk-website-python), we built a highly available web infrastructure using AWS CDK with Python. We explored the fundamentals of CDK, CloudFormation integration, and deployed a production-ready architecture with EC2 instances behind an Application Load Balancer.

In this tutorial, we'll deploy the exact same architecture, but this time using TypeScript as our CDK language. This gives you the opportunity to:

- Compare Python and TypeScript approaches to infrastructure as code
- Understand how CDK provides a consistent experience across different programming languages
- Choose the language that best fits your team's expertise and preferences
- See how type safety and IDE support differ between languages

Whether you're a JavaScript/TypeScript developer looking to manage infrastructure in a familiar language, or you're exploring different CDK language options, this guide will show you how TypeScript brings strong typing, excellent IDE support, and a robust ecosystem to your infrastructure code.


## Architecture Overview

We'll build a highly available web infrastructure with the following components:
```
┌─────────────────────────────────────────────────────────────────────┐
│                            Internet                                 │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │   Internet Gateway     │
                    └────────────────────────┘
                                 │
┌────────────────────────────────┼────────────────────────────────────┐
│                                │                  VPC               │
│                                ▼                                    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │          Application Load Balancer (ALB)                    │    │
│  │                  (Public Subnets)                           │    │
│  └──────────────────────┬──────────────────┬───────────────────┘    │
│                         │                  │                        │
│  ┌──────────────────────┼──────────────────┼─────────────────────┐  │
│  │  Availability Zone 1 │                  │ Availability Zone 2 │  │
│  │                      │                  │                     │  │
│  │  ┌───────────────────▼────────────┐  ┌──▼──────────────────┐  │  │
│  │  │   Public Subnet (AZ-1)         │  │ Public Subnet (AZ-2)│  │  │
│  │  │                                │  │                     │  │  │
│  │  │  ┌──────────────────┐          │  │                     │  │  │
│  │  │  │  NAT Gateway     │          │  │                     │  │  │
│  │  │  └────────┬─────────┘          │  │                     │  │  │
│  │  └───────────┼────────────────────┘  └─────────────────────┘  │  │
│  │              │                                                │  │
│  │  ┌───────────▼────────────────┐  ┌────────────────────────┐   │  │
│  │  │   Private Subnet (AZ-1)    │  │  Private Subnet (AZ-2) │   │  │
│  │  │                            │  │                        │   │  │
│  │  │  ┌──────────────────┐      │  │  ┌──────────────────┐  │   │  │
│  │  │  │  EC2 Instance 1  │      │  │  │  EC2 Instance 2  │  │   │  │
│  │  │  │                  │      │  │  │                  │  │   │  │
│  │  │  │                  │      │  │  │                  │  │   │  │
│  │  │  └──────────────────┘      │  │  └──────────────────┘  │   │  │
│  │  │                            │  │                        │   │  │
│  │  └────────────────────────────┘  └────────────────────────┘   │  │
│  │                                                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

```
## Building the Infrastructure

### Step 1: Project Setup

First, ensure you have the prerequisites installed:

```bash
# Install Node.js and npm (if not already installed)
# Install AWS CDK CLI globally
npm install -g aws-cdk

# Verify installation
cdk --version
```

### Step 2: Initialize the Project

```bash
# Create a new directory
mkdir aws-cdk-website
cd aws-cdk-website

# Initialize CDK project (TypeScript example)
cdk init app --language=typescript

# Install dependencies
npm install
```

### Step 3: Define the Infrastructure

The main infrastructure code creates:

**VPC Configuration**:
- 2 availability zones for redundancy
- Public subnets for the load balancer
- Private subnets for EC2 instances
- NAT gateway for outbound internet access

```typescript
// Create VPC with public and private subnets
const vpc = new ec2.Vpc(this, 'WebsiteVPC', {
  maxAzs: 2,
  natGateways: 1,
  subnetConfiguration: [
    {
      name: 'PublicSubnet',
      subnetType: ec2.SubnetType.PUBLIC,
      cidrMask: 24
    },
    {
      name: 'PrivateSubnet',
      subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      cidrMask: 24
    }
  ]
});
```

**Security Groups**:
- ALB security group: Allows HTTP/HTTPS from internet
- EC2 security group: Allows HTTP only from ALB

```typescript
// Security group for ALB (public-facing)
const albSecurityGroup = new ec2.SecurityGroup(this, 'ALBSecurityGroup', {
  vpc: vpc,
  description: 'Security group for Application Load Balancer',
  allowAllOutbound: true
});

albSecurityGroup.addIngressRule(
  ec2.Peer.anyIpv4(),
  ec2.Port.tcp(80),
  'Allow HTTP traffic from internet'
);

// Security group for EC2 instances (private)
const ec2SecurityGroup = new ec2.SecurityGroup(this, 'EC2SecurityGroup', {
  vpc: vpc,
  description: 'Security group for EC2 instances',
  allowAllOutbound: true
});

ec2SecurityGroup.addIngressRule(
  albSecurityGroup,
  ec2.Port.tcp(80),
  'Allow HTTP traffic from ALB'
);
```

**EC2 Instances**:
- Amazon Linux 2023 with Apache web server
- Deployed in private subnets across different AZs
- IMDSv2 enabled for enhanced security
- User data script for automatic web server setup

```typescript
// IAM role for EC2 instances
const ec2Role = new iam.Role(this, 'EC2Role', {
  assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
  managedPolicies: [
    iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
  ]
});

// User data script to install and configure web server
const userData = ec2.UserData.forLinux();
userData.addCommands(
  'yum update -y',
  'yum install -y httpd',
  'systemctl start httpd',
  'systemctl enable httpd',
  'TOKEN=$(curl --request PUT "http://169.254.169.254/latest/api/token" --header "X-aws-ec2-metadata-token-ttl-seconds: 3600")',
  'instanceId=$(curl -s http://169.254.169.254/latest/meta-data/instance-id --header "X-aws-ec2-metadata-token: $TOKEN")',
  'echo "<h1>AWS Linux VM Deployed with CDK</h1>" > /var/www/html/index.html',
  'echo "<p>Instance ID: $instanceId</p>" >> /var/www/html/index.html'
);

// Create EC2 instances in different AZs
const instance1 = new ec2.Instance(this, 'WebInstance1', {
  vpc: vpc,
  instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
  machineImage: ec2.MachineImage.latestAmazonLinux2023(),
  securityGroup: ec2SecurityGroup,
  role: ec2Role,
  userData: userData,
  vpcSubnets: {
    subnets: [privateSubnets.subnets[0]]
  },
  requireImdsv2: true
});

const instance2 = new ec2.Instance(this, 'WebInstance2', {
  vpc: vpc,
  instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
  machineImage: ec2.MachineImage.latestAmazonLinux2023(),
  securityGroup: ec2SecurityGroup,
  role: ec2Role,
  userData: userData,
  vpcSubnets: {
    subnets: [privateSubnets.subnets[1]]
  },
  requireImdsv2: true
});
```

**Application Load Balancer**:
- Internet-facing in public subnets
- Health checks to monitor instance status
- Distributes traffic evenly across instances

```typescript
// Application Load Balancer
const alb = new elbv2.ApplicationLoadBalancer(this, 'WebsiteALB', {
  vpc: vpc,
  internetFacing: true,
  securityGroup: albSecurityGroup,
  vpcSubnets: {
    subnetType: ec2.SubnetType.PUBLIC
  }
});

// Target group with health checks
const targetGroup = new elbv2.ApplicationTargetGroup(this, 'WebsiteTargetGroup', {
  vpc: vpc,
  port: 80,
  protocol: elbv2.ApplicationProtocol.HTTP,
  targets: [
    new elbv2_targets.InstanceTarget(instance1, 80),
    new elbv2_targets.InstanceTarget(instance2, 80)
  ],
  healthCheck: {
    path: '/',
    interval: cdk.Duration.seconds(30)
  }
});

// Listener
alb.addListener('WebsiteListener', {
  port: 80,
  protocol: elbv2.ApplicationProtocol.HTTP,
  defaultTargetGroups: [targetGroup]
});

// Outputs
new cdk.CfnOutput(this, 'LoadBalancerDNS', {
  value: alb.loadBalancerDnsName,
  description: 'DNS name of the load balancer'
});
```

### Step 4: Bootstrap Your AWS Environment

Before deploying CDK applications, you need to bootstrap your AWS environment. This creates necessary resources like an S3 bucket for storing templates and IAM roles for deployments.

```bash
# Configure AWS credentials
aws configure

# Bootstrap CDK (one-time per account/region)
cdk bootstrap aws://ACCOUNT-ID/REGION

# Or let CDK detect your account
cdk bootstrap
```

### Step 5: Deploy the Infrastructure

```bash
# Synthesize CloudFormation template (optional - to preview)
cdk synth

# View changes before deployment
cdk diff

# Deploy the stack
cdk deploy

# Approve the changes when prompted
```

The deployment process:
1. CDK synthesizes your code into CloudFormation templates
2. Templates are uploaded to the bootstrap S3 bucket
3. CloudFormation creates a change set
4. Resources are provisioned in dependency order
5. Outputs are displayed (including the load balancer URL)

### Step 6: Access Your Website

After deployment completes (typically 5-10 minutes), you'll see outputs like:

```
Outputs:
WebsiteStack.LoadBalancerDNS = WebsiteStack-ALB-XXXXX.region.elb.amazonaws.com
WebsiteStack.Instance1Id = i-0123456789abcdef0
WebsiteStack.Instance2Id = i-0123456789abcdef1
```

Open the LoadBalancerDNS URL in your browser to see your website. Refresh multiple times to see traffic distributed across different instances in different availability zones.

## Cleanup

To avoid ongoing AWS charges, destroy the infrastructure when you're done:

```bash
# Delete all resources
cdk destroy

# Confirm deletion when prompted
```

This removes all resources created by the stack. CloudFormation ensures clean deletion in the correct order, handling dependencies automatically.

**Note**: The bootstrap resources (S3 bucket, IAM roles) are not deleted by `cdk destroy`. These are shared across all CDK applications in your account and should be kept for future use.

## Project Structure

Understanding the CDK project structure helps you navigate and organize your infrastructure code effectively:

```
aws-cdk-website/
├── bin/
│   └── app.ts                    # CDK app entry point - defines stacks
├── lib/
│   └── website-stack.ts          # Main stack with VPC, EC2, ALB resources
├── node_modules/                 # npm dependencies (auto-generated)
├── cdk.out/                      # Synthesized CloudFormation templates
├── cdk.json                      # CDK toolkit configuration
├── cdk.context.json              # CDK context values (auto-generated)
├── package.json                  # Node.js project dependencies and scripts
├── package-lock.json             # Locked dependency versions
├── tsconfig.json                 # TypeScript compiler configuration
```

### Key Files Explained:

**bin/app.ts** - Application entry point where you instantiate your CDK app and stacks:
```typescript
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { WebsiteStack } from '../lib/website-stack';

const app = new cdk.App();
new WebsiteStack(app, 'WebsiteStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  }
});
```

**lib/website-stack.ts** - Contains your infrastructure definitions (VPC, EC2, ALB, security groups, etc.)

**cdk.json** - Configures how the CDK toolkit executes your app:
```json
{
  "app": "npx ts-node --prefer-ts-exts bin/app.ts",
  "context": {
    "@aws-cdk/core:enableStackNameDuplicates": true,
    "aws-cdk:enableDiffNoFail": true
  }
}
```

**package.json** - Defines project metadata, dependencies, and useful scripts:
```json
{
  "scripts": {
    "build": "tsc",
    "watch": "tsc -w",
    "deploy": "npm run build && cdk deploy",
    "synth": "cdk synth",
    "diff": "cdk diff",
    "destroy": "cdk destroy"
  }
}
```

**cdk.out/** - Generated directory containing CloudFormation templates after running `cdk synth`. This is what actually gets deployed to AWS.


## Conclusion

## Conclusion

We've successfully deployed the same highly available web infrastructure from our previous Python CDK tutorial, but this time using TypeScript. As you've seen, AWS CDK provides a consistent and powerful experience regardless of your language choice.

TypeScript brings several advantages to infrastructure as code:

- **Strong type safety**: Catch errors at compile time before deployment
- **Superior IDE support**: Autocomplete, inline documentation, and refactoring tools
- **Familiar syntax**: JavaScript/TypeScript developers can leverage existing knowledge
- **Rich ecosystem**: Access to npm packages and TypeScript tooling
- **Better collaboration**: Type definitions serve as living documentation

Whether you choose Python, TypeScript, or another supported language, CDK transforms infrastructure provisioning from a tedious, error-prone process into an enjoyable development experience. The combination of CDK's developer-friendly interface and CloudFormation's robust deployment engine provides the best of both worlds.

## References

- **GitHub Repository**: [aws-cdk-typescript](https://github.com/chinmayto/aws-cdk-typescript)
- **AWS CDK Documentation**: https://docs.aws.amazon.com/cdk/
