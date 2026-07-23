import boto3

from .config import settings

_s3 = None


def _client():
    global _s3
    if _s3 is None:
        _s3 = boto3.client(
            "s3",
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            region_name=settings.aws_region,
            # Force the regional endpoint explicitly. Without this, boto3 can
            # generate presigned URLs against the legacy global endpoint
            # (s3.amazonaws.com) for non-us-east-1 buckets; S3 then 307s to
            # the correct regional host, but the redirected request's Host
            # header no longer matches what was signed, so it 403s with
            # SignatureDoesNotMatch instead of returning the object.
            endpoint_url=f"https://s3.{settings.aws_region}.amazonaws.com",
        )
    return _s3


def upload_bytes(key: str, data: bytes, content_type: str) -> None:
    _client().put_object(Bucket=settings.aws_s3_bucket, Key=key, Body=data, ContentType=content_type)


def delete_object(key: str) -> None:
    _client().delete_object(Bucket=settings.aws_s3_bucket, Key=key)


def presigned_get_url(key: str, expires_in: int | None = None) -> str:
    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.aws_s3_bucket, "Key": key},
        ExpiresIn=expires_in or settings.s3_presign_expiry_seconds,
    )
