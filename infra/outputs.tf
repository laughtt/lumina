output "app_policy_arn" {
  value = aws_iam_policy.app.arn
}

output "api_url" {
  value = var.deploy_cloud ? module.cloud[0].api_url : "http://localhost:8787"
}

output "web_url" {
  value = var.deploy_cloud ? module.cloud[0].web_url : "http://localhost:5173"
}

output "web_bucket" {
  value = var.deploy_cloud ? module.cloud[0].web_bucket : null
}

output "studio_url" {
  description = "Open once; the household code is remembered by the browser."
  sensitive   = true
  value       = "${var.deploy_cloud ? module.cloud[0].web_url : "http://localhost:5173"}/?code=${random_password.token.result}"
}

output "mcp_url" {
  value = var.deploy_cloud ? "${module.cloud[0].api_url}mcp" : "http://localhost:8787/mcp"
}

output "env_file" {
  sensitive = true
  value     = <<-EOT
    AWS_REGION=${var.region}
    TABLE_NAME=${aws_dynamodb_table.main.name}
    TOPIC_ARN=${aws_sns_topic.alerts.arn}
    MODEL_ID=${var.model_id}
    FAST_MODEL_ID=${var.fast_model_id}
    LUMINA_TOKEN=${random_password.token.result}
    AGENT_URL=http://localhost:8790
    PORT=8787
  EOT
}
