const Minio = require('minio');
const crypto = require('crypto');
const path = require('path');

// Create a MinIO client instance
const minioClient = new Minio.Client({
  endPoint: process.env.ENDPOINT,
  port: parseInt(process.env.MINIO_PORT),
  useSSL: true,
  accessKey: process.env.ACCESS_KEY,
  secretKey: process.env.SECRET_KEY,
  region: process.env.REGION
});

const bucketName = process.env.BUCKET_NAME;

// Verify MinIO connection and bucket
const verifyMinioConnection = async () => {
  try {
    const exists = await minioClient.bucketExists(bucketName);
    if (!exists) {
      throw new Error(`Bucket '${bucketName}' does not exist`);
    }
    return true;
  } catch (error) {
    console.error('MinIO Connection Error:', error);
    throw new Error(`MinIO Connection Failed: ${error.message}`);
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

// Determine content type with additional validation
const getContentType = (mimetype) => {
  const contentTypes = {
    'image/jpeg': 'image/jpeg',
    'image/png': 'image/png',
    'image/gif': 'image/gif',
    'image/webp': 'image/webp',
    'video/mp4': 'video/mp4',
    'video/mpeg': 'video/mpeg',
    'video/quicktime': 'video/quicktime',
    'video/x-msvideo': 'video/x-msvideo'
  };
  
  const type = contentTypes[mimetype];
  if (!type) {
    throw new Error(`Unsupported file type: ${mimetype}`);
  }
  return type;
};

// Upload a single file
const uploadFile = async (file) => {
  try {
    // Verify connection before upload
    await verifyMinioConnection();

    // Validate file
    if (!file || !file.buffer || !file.originalname) {
      throw new Error('Invalid file object');
    }

    const fileName = generateUniqueFileName(file.originalname);
    const contentType = getContentType(file.mimetype);
    const fileType = file.mimetype.startsWith('image/') ? 'image' : 'video';
    
    const metaData = {
      'Content-Type': contentType,
      'Content-Length': file.buffer.length,
      'Original-Name': file.originalname
    };
    
    // Upload with retry mechanism
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        await minioClient.putObject(
          bucketName,
          fileName,
          file.buffer,
          metaData
        );
        break;
      } catch (error) {
        attempts++;
        if (attempts === maxAttempts) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      }
    }

    // Generate URL
    const cdnEndpoint = process.env.ENDPOINT;
    const fileUrl = `https://${cdnEndpoint}/${bucketName}/${fileName}`;
    
    return {
      url: fileUrl,
      type: fileType,
      filename: fileName,
      originalName: file.originalname,
      size: file.buffer.length
    };
  } catch (error) {
    console.error('Error uploading file:', error);
    throw new Error(`File upload failed: ${error.message}`);
  }
};

// Delete a single file
const deleteFile = async (fileName) => {
  try {
    await verifyMinioConnection();
    
    // Check if file exists before deletion
    try {
      await minioClient.statObject(bucketName, fileName);
    } catch (error) {
      if (error.code === 'NotFound') {
        throw new Error(`File ${fileName} not found`);
      }
      throw error;
    }

    await minioClient.removeObject(bucketName, fileName);
    return true;
  } catch (error) {
    console.error('Error deleting file:', error);
    throw new Error(`File deletion failed: ${error.message}`);
  }
};
// List all files in bucket
const listFiles = async (prefix = '') => {
  try {
    await verifyMinioConnection();
    
    const files = [];
    const stream = minioClient.listObjects(bucketName, prefix, true);
    
    return new Promise((resolve, reject) => {
      stream.on('data', (obj) => {
        files.push({
          name: obj.name,
          size: obj.size,
          lastModified: obj.lastModified,
          url: `https://${process.env.ENDPOINT}/${bucketName}/${obj.name}`
        });
      });
      
      stream.on('error', (err) => {
        reject(new Error(`Error listing files: ${err.message}`));
      });
      
      stream.on('end', () => {
        resolve(files);
      });
    });
  } catch (error) {
    console.error('Error listing files:', error);
    throw new Error(`File listing failed: ${error.message}`);
  }
};

module.exports = {
  uploadFile,
  deleteFile,
  verifyMinioConnection,
  listFiles
};