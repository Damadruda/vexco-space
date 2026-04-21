import { S3Client } from "@aws-sdk/client-s3";

export function getBucketConfig() {
  return {
    bucketName: process.env.AWS_BUCKET_NAME ?? "",
    folderPrefix: process.env.AWS_FOLDER_PREFIX ?? ""
  };
}

export function createS3Client() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION ?? "us-east-1";

  if (!accessKeyId || !secretAccessKey) {
    // Fallback a la cadena default del SDK (local con AWS_PROFILE)
    return new S3Client({ region });
  }

  return new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey }
  });
}
