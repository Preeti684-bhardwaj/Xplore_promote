const moment = require('moment-timezone');

// -------------Validate campaign timing information-------------------------------------------
const validateTiming = (timing) => {
  const errors = [];

  if (!timing) {
    errors.push('Timing information is required');
    return errors;
  }

  const { startDate, endDate, timeZone = 'UTC' } = timing;

  // Basic field validation
  if (!startDate) errors.push('Start date is required');
  if (!endDate) errors.push('End date is required');

  // Validate timezone
  if (timeZone && !moment.tz.zone(timeZone)) {
    errors.push('Invalid timezone');
    return errors;
  }

  // Stricter date format validation
  const start = moment.tz(startDate, timeZone);
  const end = moment.tz(endDate, timeZone);

  if (!start.isValid()) {
    errors.push('Invalid start date format. Expected format: YYYY-MM-DDTHH:mm:ssZ');
  }
  if (!end.isValid()) {
    errors.push('Invalid end date format. Expected format: YYYY-MM-DDTHH:mm:ssZ');
  }

  // Additional validations if dates are valid
  if (start.isValid() && end.isValid()) {
    // Check if dates are in the past
    const now = moment().tz(timeZone);
    if (start.isBefore(now)) {
      errors.push('Start date cannot be in the past');
    }

    // Ensure minimum campaign duration (e.g., 1 hour)
    const minDuration = moment.duration(1, 'hour');
    if (end.diff(start) < minDuration.asMilliseconds()) {
      errors.push('Campaign duration must be at least 1 hour');
    }

    // Check if end date is before start date
    if (end.isBefore(start)) {
      errors.push('End date cannot be before start date');
    }

    // Check if campaign duration is too long (e.g., max 1 year)
    const maxDuration = moment.duration(1, 'year');
    if (end.diff(start) > maxDuration.asMilliseconds()) {
      errors.push('Campaign duration cannot exceed 1 year');
    }
  }

  return errors;
};

// -------------Get campaign status-------------------------------------------
const getCampaignStatus = (startDate, endDate, timeZone = 'UTC') => {
  try {
    if (!startDate || !endDate) {
      throw new Error('Start date and end date are required');
    }

    // Convert dates to moment objects in the specified timezone
    const now = moment().tz(timeZone);
    const start = moment.tz(startDate, timeZone);
    const end = moment.tz(endDate, timeZone);

    // Enhanced validation
    if (!start.isValid() || !end.isValid()) {
      throw new Error('Invalid date format. Expected format: YYYY-MM-DDTHH:mm:ssZ');
    }

    if (end.isBefore(start)) {
      throw new Error('End date cannot be before start date');
    }

    // Enhanced status determination with more specific states
    if (now.isBefore(start)) {
      const hoursToStart = start.diff(now, 'hours');
      if (hoursToStart <= 24) {
        return 'Starting Soon';
      }
      return 'Upcoming';
    } else if (now.isAfter(end)) {
      return 'Completed';
    } else {
      const hoursToEnd = end.diff(now, 'hours');
      if (hoursToEnd <= 24) {
        return 'Ending Soon';
      }
      return 'Ongoing';
    }
  } catch (error) {
    console.error('Error calculating campaign status:', error);
    throw error;
  }
};

module.exports = {
  getCampaignStatus,
  validateTiming
};