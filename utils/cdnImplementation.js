const { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

// DigitalOcean Spaces client configuration
const createS3Client = () => {
  return new S3Client({
    endpoint: process.env.DO_SPACES_ENDPOINT, // e.g., "https://nyc3.digitaloceanspaces.com"
    forcePathStyle: false,
    region: process.env.DO_SPACES_REGION || "us-east-1", // Use "us-east-1" for newer spaces
    credentials: {
      accessKeyId: process.env.DO_SPACES_ACCESS_KEY,
      secretAccessKey: process.env.DO_SPACES_SECRET_KEY
    }
  });
};

const s3Client = createS3Client();
const bucketName = process.env.DO_SPACES_BUCKET_NAME;

// CDN configuration
const cdnConfig = {
  domain: process.env.CDN_DOMAIN || `${bucketName}.${process.env.DO_SPACES_REGION || 'nyc3'}.digitaloceanspaces.com`,
  enabled: process.env.CDN_ENABLED === 'true' || false
};

// Verify connection to DigitalOcean Spaces
const verifyConnection = async () => {
  try {
    // First check if bucket name is configured
    if (!bucketName) {
      throw new Error('Bucket name is not configured in environment variables');
    }
    
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      MaxKeys: 1
    });
    await s3Client.send(command);
    return true;
  } catch (error) {
    console.error('DigitalOcean Spaces Connection Error:', error);
    
    // Provide more specific error messages
    if (error.Code === 'NoSuchBucket' || error.name === 'NoSuchBucket') {
      throw new Error(`Bucket '${bucketName}' does not exist. Please create it in your DigitalOcean Spaces dashboard or check the bucket name in your environment variables.`);
    } else if (error.Code === 'AccessDenied' || error.name === 'AccessDenied') {
      throw new Error(`Access denied to bucket '${bucketName}'. Please check your credentials and permissions.`);
    } else {
      throw new Error(`DigitalOcean Spaces Connection Failed: ${error.message || error.Code || 'Unknown error'}`);
    }
  }
};

// Generate unique filename with sanitization
const generateUniqueFileName = (originalName) => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  const sanitizedName = path.basename(originalName).replace(/[^a-zA-Z0-9.-]/g, '_');
  const extension = path.extname(sanitizedName).toLowerCase();
  return `${timestamp}-${randomString}${extension}`;
};

// Generate file URL (with or without CDN)
const generateFileUrl = (fileName) => {
  // If CDN is enabled, use CDN domain, otherwise fallback to spaces endpoint
  const domain = cdnConfig.enabled ? cdnConfig.domain : `${bucketName}.${process.env.DO_SPACES_REGION || 'nyc3'}.digitaloceanspaces.com`;
  return `https://${domain}/${fileName}`;
};

// Upload a single file to DigitalOcean Spaces
const uploadFile = async (file) => {
  try {
    // Verify connection before upload
    await verifyConnection();

    // Validate file
    if (!file || !file.buffer || !file.originalname) {
      throw new Error('Invalid file object');
    }

    const fileName = generateUniqueFileName(file.originalname);
    
    const uploadParams = {
      Bucket: bucketName,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype || 'application/octet-stream',
      ContentLength: file.buffer.length,
      ACL: 'public-read', // Set ACL as needed for your use case
      Metadata: {
        'original-name': file.originalname
      }
    };
    
    // Upload with retry mechanism
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        const command = new PutObjectCommand(uploadParams);
        await s3Client.send(command);
        break;
      } catch (error) {
        attempts++;
        console.log("error attempts:", attempts);
        console.log("error message:", error.message);
        if (attempts === maxAttempts) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      }
    }

    // Generate URL
    const fileUrl = generateFileUrl(fileName);
    
    return {
      url: fileUrl,
      filename: fileName,
      originalName: file.originalname,
      size: file.buffer.length,
      mimetype: file.mimetype || 'application/octet-stream',
      cdnEnabled: cdnConfig.enabled
    };
  } catch (error) {
    console.error('Error uploading file:', error);
    throw new Error(`File upload failed: ${error.message}`);
  }
};

// Handle multiple file uploads
const uploadFiles = async (files) => {
  if (!Array.isArray(files)) {
    throw new Error('Files must be an array');
  }

  if (files.length === 0) {
    return [];
  }

  try {
    const uploadPromises = files.map(file => uploadFile(file));
    const results = await Promise.all(uploadPromises);
    return results;
  } catch (error) {
    throw new Error(`Multiple file upload failed: ${error.message}`);
  }
};

// Delete a single file from DigitalOcean Spaces
const deleteFile = async (fileName) => {
  try {
    await verifyConnection();
    
    // Check if file exists before deletion
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: bucketName,
        Key: fileName
      });
      await s3Client.send(headCommand);
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        throw new Error(`File ${fileName} not found`);
      }
      throw error;
    }
    
    const deleteCommand = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: fileName
    });
    
    await s3Client.send(deleteCommand);
    return true;
  } catch (error) {
    console.error('Error deleting file:', error);
    throw new Error(`File deletion failed: ${error.message}`);
  }
};

// List all files in the bucket
const listFiles = async (prefix = '') => {
  try {
    await verifyConnection();
    
    const files = [];
    let continuationToken = undefined;
    
    do {
      const command = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken
      });
      
      const response = await s3Client.send(command);
      
      if (response.Contents) {
        response.Contents.forEach(obj => {
          files.push({
            name: obj.Key,
            size: obj.Size,
            lastModified: obj.LastModified,
            url: generateFileUrl(obj.Key),
            cdnEnabled: cdnConfig.enabled
          });
        });
      }
      
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
    
    return files;
  } catch (error) {
    console.error('Error listing files:', error);
    throw new Error(`File listing failed: ${error.message}`);
  }
};

module.exports = {
  uploadFile,
  uploadFiles,
  deleteFile,
  verifyConnection,
  listFiles
};