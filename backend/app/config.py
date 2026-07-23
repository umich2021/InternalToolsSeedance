from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Your BytePlus ModelArk API key. Get one at:
    # https://console.byteplus.com/ark/region:ark+eu-west-1/apiKey
    ark_api_key: str = ""

    # International (BytePlus) endpoint by default. Override for other regions.
    ark_base_url: str = "https://ark.ap-southeast.bytepluses.com/api/v3"

    # Default model id used when the frontend doesn't override it.
    seedance_model: str = "dreamina-seedance-2-0-260128"

    # Model id for each selectable tier in the UI.
    seedance_model_mini: str = "dreamina-seedance-2-0-mini"
    seedance_model_fast: str = "dreamina-seedance-2-0-fast-260128"
    seedance_model_regular: str = "dreamina-seedance-2-0-260128"

    # Allowed origin(s) for the React dev server.
    cors_origin: str = "http://localhost:5173"

    # S3 archive for generated videos. IAM user should be scoped to just this
    # bucket, with s3:PutObject / s3:GetObject / s3:DeleteObject.
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "us-east-2"
    aws_s3_bucket: str = ""
    s3_presign_expiry_seconds: int = 28800  # 8 hours


settings = Settings()
