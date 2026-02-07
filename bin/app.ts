#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { WebsiteStack } from '../lib/website-stack';

const app = new cdk.App();

// Get account and region from context or environment
const account = app.node.tryGetContext('account') || process.env.CDK_DEFAULT_ACCOUNT;
const region = app.node.tryGetContext('region') || process.env.CDK_DEFAULT_REGION || 'us-east-1';

if (!account) {
  console.warn('Warning: Could not determine AWS account ID. Make sure AWS credentials are configured.');
  console.warn('You can also set it manually: cdk deploy --context account=YOUR_ACCOUNT_ID');
}

console.log(`Deploying to account: ${account || 'unknown'}, region: ${region}`);

const env: cdk.Environment = {
  account: account,
  region: region
};

new WebsiteStack(app, 'WebsiteStack', {
  env: env,
  description: 'Website infrastructure with VPC, ALB, and Auto Scaling Group'
});

app.synth();
