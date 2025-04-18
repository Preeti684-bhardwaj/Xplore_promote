const validator = require("validator");

// ------------------validate email-------------------------------------
const isValidEmail = email => validator.isEmail(email);

// const isValidPhone = (phone) => validator.isMobilePhone(phone, "en-IN");

// ------------------validate password-------------------------------------
const isValidPassword = (password) => {
  if (password.length < 8) {
    return "Password must be at least 8 characters long";
  }
  if (!/(?=.*[a-z])/.test(password)) {
    return "Password must contain at least one lowercase letter";
  }

  if (!/(?=.*[A-Z])/.test(password)) {
    return "Password must contain at least one uppercase letter";
  }

  if (!/(?=.*\d)/.test(password)) {
    return "Password must contain at least one number";
  }

  if (!/(?=.*[@$!%*?&.,:;<>^()[\]{}+_=|/~`#\\-])/.test(password)) {
    return "Password must contain at least one special character";
  }

  if (/\s/.test(password)) {
    return "Password must not contain any spaces";
  }

  // If all checks pass, the password is valid
  return null;
};

// ------------------validate name-------------------------------------
const isValidLength = (name) => {
  // const nameRegex = /^(?=.{4,40}$)[A-Za-z](?:\s?[A-Za-z]+)*[A-Za-z]$/;
  if (!name) {
    return "Name is required";
  }
  if (/^\s|\s$/.test(name)) {
    return "Name should not start or end with a space";
  }
  if (name.length < 4 || name.length > 40) {
    return "Name should be between 4 and 40 characters long";
  }
  if (/^[0-9]/.test(name)) {
    return "Name should not start with a number";
  }
  if (/\d/.test(name)) {
    return "Name should not contain numbers";
  }
  if (/[^a-zA-Z\s]/.test(name)) {
    return "Name should only contain letters and spaces";
  }
  if (/\s{2,}/.test(name)) {
    return "Name should not contain consecutive spaces";
  }
  // if (!nameRegex.test(name)) {
  //   return "Name contains invalid characters";
  // }
  return null;  // No errors
};

// ------------------validate phone-------------------------------------
const isPhoneValid = (phone) => {
  if (!phone) {
    return "Phone number is required";
  }
  // Check if phone number contains only digits, hyphens, spaces, and the plus sign
  if (!/^[\d\s+-]+$/.test(phone)) {
    return "Phone number should only contain digits, spaces, hyphens, and the plus sign";
  }
  // Check if phone number does not start with a space
  if (/^[\s]/.test(phone)) {
    return "Phone number should not start with a space";
  }
  // Check if phone number does not contain consecutive spaces
  if (/\s{2,}/.test(phone)) {
    return "Phone number should not contain consecutive spaces";
  }
  return null;  // No errors
};

// ------------------get platform-------------------------------------
const getPlatform = (userAgent) => {
  if (!userAgent) return 'unknown';
  
  // Check if it's a mobile device
  const isMobile = /Mobile|Android|iPhone|iPad|iPod|iPad Simulator|iPhone Simulator|iPod Simulator|PostmanRuntime|okhttp|CFNetwork|Darwin/i.test(userAgent);
  return isMobile ? 'mobile' : 'web';
};

// ------------------detect OS-------------------------------------
const detectOS = (userAgent) => {
  if (!userAgent) return 'Unknown';
  
  if (userAgent.includes('Windows')) {
    return 'Windows';
  } else if (userAgent.includes('Mac OS')) {
    return 'MacOS';
  } else if (userAgent.includes('Linux')) {
    return 'Linux';
  } else if (userAgent.includes('Android') ||userAgent.includes('okhttp')) {
    return 'Android';
  } else if (userAgent.includes('iPhone') || userAgent.includes('iPad') || userAgent.includes('iPod') || userAgent.includes('iPad Simulator') || userAgent.includes('iPhone Simulator') || userAgent.includes('iPod Simulator') || userAgent.includes('CFNetwork') || userAgent.includes('Darwin')) {
    return 'IOS';
  }
  return 'Unknown';
};


module.exports = {
  isValidEmail,
  isPhoneValid,
  isValidPassword,
  isValidLength,
  getPlatform,
  detectOS
};

