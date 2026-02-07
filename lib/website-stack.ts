import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class WebsiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

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

    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS traffic from internet'
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

    ec2SecurityGroup.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(22),
      'Allow SSH from VPC'
    );

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
      'echo \'<h1>Hello from AWS CDK!</h1>\' > /var/www/html/index.html',
      'echo \'<p>This website is running on EC2 in a private subnet</p>\' >> /var/www/html/index.html',
      'echo \'<p>Instance ID: \' $(curl -s http://169.254.169.254/latest/meta-data/instance-id) \'</p>\' >> /var/www/html/index.html'
    );

    // Launch template for Auto Scaling Group
    const launchTemplate = new ec2.LaunchTemplate(this, 'WebsiteLaunchTemplate', {
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2
      }),
      securityGroup: ec2SecurityGroup,
      role: ec2Role,
      userData: userData
    });

    // Auto Scaling Group
    const asg = new autoscaling.AutoScalingGroup(this, 'WebsiteASG', {
      vpc: vpc,
      launchTemplate: launchTemplate,
      minCapacity: 1,
      maxCapacity: 3,
      desiredCapacity: 2,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      }
    });

    // Application Load Balancer
    const alb = new elbv2.ApplicationLoadBalancer(this, 'WebsiteALB', {
      vpc: vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC
      }
    });

    // Target group
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'WebsiteTargetGroup', {
      vpc: vpc,
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      healthCheck: {
        path: '/',
        interval: cdk.Duration.seconds(30)
      }
    });

    // Add the Auto Scaling Group to the target group
    targetGroup.addTarget(asg);

    // Listener
    alb.addListener('WebsiteListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultTargetGroups: [targetGroup]
    });

    // Bastion host for SSH access to private instances
    const bastionHost = new ec2.BastionHostLinux(this, 'BastionHost', {
      vpc: vpc,
      subnetSelection: {
        subnetType: ec2.SubnetType.PUBLIC
      }
    });

    // Outputs
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: alb.loadBalancerDnsName,
      description: 'DNS name of the load balancer'
    });

    new cdk.CfnOutput(this, 'BastionHostId', {
      value: bastionHost.instanceId,
      description: 'Instance ID of the bastion host'
    });

    new cdk.CfnOutput(this, 'VPCId', {
      value: vpc.vpcId,
      description: 'VPC ID'
    });
  }
}
