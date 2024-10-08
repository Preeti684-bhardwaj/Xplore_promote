const notification = async (req, res) => {
    // Access the notification payload sent by Apple
    const notificationPayload = req.body;
    
    // Log the notification for debugging purposes
    console.log('Received notification from Apple:', notificationPayload);
  
    // Handle different notification types
    switch (notificationPayload.notification_type) {
      case 'EMAIL_REVOKE':
        console.log(`User's email has been revoked or changed: ${notificationPayload.sub}`);
        // Implement your logic to handle email revocation (e.g., disable forwarding)
        break;
  
      case 'ACCOUNT_DELETE':
        console.log(`User's account has been deleted: ${notificationPayload.sub}`);
        // Implement your logic to handle account deletion (e.g., update the database)
        break;
  
      default:
        console.warn('Unknown notification type received:', notificationPayload.notification_type);
    }
  
    // Respond to Apple to confirm receipt of the notification
    res.status(200).json({ message: 'Notification received and processed.' });
  };

  
module.exports = {
    notification
}