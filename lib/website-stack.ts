import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as elbv2_targets from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
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

    // IAM role for EC2 instances
    const ec2Role = new iam.Role(this, 'EC2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
      ]
    });

    // User data script to install and configure web server with IMDSv2
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      'yum update -y',
      'yum install -y httpd',
      'systemctl start httpd',
      'systemctl enable httpd',
      'TOKEN=$(curl --request PUT "http://169.254.169.254/latest/api/token" --header "X-aws-ec2-metadata-token-ttl-seconds: 3600")',
      'instanceId=$(curl -s http://169.254.169.254/latest/meta-data/instance-id --header "X-aws-ec2-metadata-token: $TOKEN")',
      'instanceAZ=$(curl -s http://169.254.169.254/latest/meta-data/placement/availability-zone --header "X-aws-ec2-metadata-token: $TOKEN")',
      'privHostName=$(curl -s http://169.254.169.254/latest/meta-data/local-hostname --header "X-aws-ec2-metadata-token: $TOKEN")',
      'privIPv4=$(curl -s http://169.254.169.254/latest/meta-data/local-ipv4 --header "X-aws-ec2-metadata-token: $TOKEN")',
      'echo "<font face = \\"Verdana\\" size = \\"5\\">"                               > /var/www/html/index.html',
      'echo "<center><h1>AWS Linux VM Deployed with CDK using TypeScript</h1></center>"   >> /var/www/html/index.html',
      'echo "<center> <b>EC2 Instance Metadata</b> </center>"                  >> /var/www/html/index.html',
      'echo "<center> <b>Instance ID:</b> $instanceId </center>"               >> /var/www/html/index.html',
      'echo "<center> <b>AWS Availablity Zone:</b> $instanceAZ </center>"      >> /var/www/html/index.html',
      'echo "<center> <b>Private Hostname:</b> $privHostName </center>"        >> /var/www/html/index.html',
      'echo "<center> <b>Private IPv4:</b> $privIPv4 </center>"                >> /var/www/html/index.html',
      'echo "</font>"                                                          >> /var/www/html/index.html'
    );

    // Get the private subnets for the two AZs
    const privateSubnets = vpc.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
    });

    // Create EC2 instance in first AZ
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

    // Create EC2 instance in second AZ
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

    new cdk.CfnOutput(this, 'Instance1Id', {
      value: instance1.instanceId,
      description: 'Instance ID of the first EC2 instance'
    });

    new cdk.CfnOutput(this, 'Instance2Id', {
      value: instance2.instanceId,
      description: 'Instance ID of the second EC2 instance'
    });

    new cdk.CfnOutput(this, 'VPCId', {
      value: vpc.vpcId,
      description: 'VPC ID'
    });
  }
}
