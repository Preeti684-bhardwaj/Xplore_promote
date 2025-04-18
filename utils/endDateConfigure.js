const calculateEndDate = (startDate, duration) => {
    const date = new Date(startDate);
    switch (duration) {
      case 'monthly':
        date.setMonth(date.getMonth() + 1);
        break;
      case 'quarterly':
        date.setMonth(date.getMonth() + 3);
        break;
      case 'half-yearly':
        date.setMonth(date.getMonth() + 6);
        break;
      case 'annually':
        date.setFullYear(date.getFullYear() + 1);
        break;
      default:
        throw new Error('Invalid subscription duration');
    }
    return date;
  };
  
  module.exports = calculateEndDate;
  