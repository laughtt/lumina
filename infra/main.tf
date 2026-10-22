data "aws_caller_identity" "me" {}

resource "aws_dynamodb_table" "main" {
  name         = var.project
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }
  attribute {
    name = "SK"
    type = "S"
  }
}

resource "aws_s3_bucket" "media" {
  bucket        = "${var.project}-media-${data.aws_caller_identity.me.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_sns_topic" "alerts" {
  name = "${var.project}-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  for_each  = toset(var.alert_emails)
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

resource "random_password" "token" {
  length  = 40
  special = false
}

resource "aws_iam_policy" "app" {
  name = "${var.project}-app"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Table"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:BatchWriteItem"]
        Resource = aws_dynamodb_table.main.arn
      },
      {
        Sid      = "AgentRun"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.media.arn}/agent/*"
      },
      {
        Sid      = "WakeAgent"
        Effect   = "Allow"
        Action   = "lambda:InvokeFunction"
        Resource = "arn:aws:lambda:${var.region}:${data.aws_caller_identity.me.account_id}:function:${var.project}-agent"
      },
      {
        Sid      = "Alerts"
        Effect   = "Allow"
        Action   = "sns:Publish"
        Resource = aws_sns_topic.alerts.arn
      },
      {
        Sid      = "Claude"
        Effect   = "Allow"
        Action   = "bedrock-mantle:CreateInference"
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_user_policy_attachment" "dev" {
  count      = var.dev_user_name == "" ? 0 : 1
  user       = var.dev_user_name
  policy_arn = aws_iam_policy.app.arn
}

resource "aws_budgets_budget" "monthly" {
  count        = var.budget_email == "" ? 0 : 1
  name         = "${var.project}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 50
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_email]
  }
}

module "cloud" {
  count  = var.deploy_cloud ? 1 : 0
  source = "./cloud"

  project        = var.project
  app_policy_arn = aws_iam_policy.app.arn
  env = {
    TABLE_NAME    = aws_dynamodb_table.main.name
    MEDIA_BUCKET  = aws_s3_bucket.media.bucket
    TOPIC_ARN     = aws_sns_topic.alerts.arn
    MODEL_ID      = var.model_id
    FAST_MODEL_ID = var.fast_model_id
    LUMINA_TOKEN  = random_password.token.result
    GOOGLE_CLIENT_ID = var.google_client_id
  }
}
