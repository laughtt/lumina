variable "region" {
  type    = string
  default = "us-east-1"
}

variable "project" {
  type    = string
  default = "lumina"
}

variable "model_id" {
  type    = string
  default = "anthropic.claude-opus-5-5"
}

variable "fast_model_id" {
  description = "The simulated Alexa's tool choice. Falls back to model_id if the account hasn't enabled it."
  type        = string
  default     = "anthropic.claude-haiku-5-5"
}

variable "alert_emails" {
  description = "Ana and Luis in the demo. Each address gets a confirmation email from SNS."
  type        = list(string)
  default     = []
}

variable "budget_email" {
  type    = string
  default = ""
}

variable "budget_usd" {
  type    = number
  default = 20
}

variable "dev_user_name" {
  description = "IAM user that runs the app on a laptop. Leave empty if the user is already an admin."
  type        = string
  default     = ""
}

variable "deploy_cloud" {
  description = "false = local demo (only data, AI and alerts in AWS). true = also Lambdas, schedules and CloudFront."
  type        = bool
  default     = false
}

variable "google_client_id" {
  description = "iOS OAuth client ID from Google Cloud (Sign in with Google). Empty turns Google sign-in off."
  type        = string
  default     = ""
}
