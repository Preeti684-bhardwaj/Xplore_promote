const axios = require('axios');
require('dotenv').config();
const ErrorHandler = require('../utils/ErrorHandler');

const MAX_RETRIES = 3;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const retryRequest = async (fn, maxRetries = MAX_RETRIES) => {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) {
        throw new ErrorHandler(`Shiprocket request failed after ${maxRetries} attempts: ${error.message}`, 502);
      }
      const backoff = 500 * Math.pow(2, attempt); // Exponential backoff
      await delay(backoff);
    }
  }
};

const getShiprocketToken = async () => {
  return retryRequest(async () => {
    const response = await axios.post('https://apiv2.shiprocket.in/v1/external/auth/login', {
      email: process.env.SHIPROCKET_EMAIL,
      password: process.env.SHIPROCKET_PASSWORD,
    });
    return response.data.token;
  });
};

const fetchShippingRates = async (pincode, weight, pickup) => {
  const token = await getShiprocketToken();

  return retryRequest(async () => {
    const response = await axios.get('https://apiv2.shiprocket.in/v1/external/courier/serviceability/', {
      headers: { Authorization: `Bearer ${token}` },
      params: { pickup_postcode: pickup, delivery_postcode: pincode, weight, cod: 0 },
    });

    const courier = response.data?.data?.available_courier_companies?.[0];
    if (!courier) throw new ErrorHandler('No courier available for the selected route' , 400);
    return {
      rate: courier.rate,
      etd: courier.estimated_delivery_date
    };
  });
};

const createShipment = async (order, product, shippingDetails) => {
  const token = await getShiprocketToken();

  const payload = {
    order_id: `ORD-${order.orderId}`,
    order_date: new Date().toISOString().split('T')[0],
    pickup_location: shippingDetails.address,
    billing_customer_name: shippingDetails.name,
    billing_address: shippingDetails.address,
    billing_city: shippingDetails.city,
    billing_pincode: shippingDetails.pincode,
    billing_phone: shippingDetails.phone,
    shipping_is_billing: true,
    order_items: [{ name: product.name, sku: product.id, units: order.quantity, selling_price: product.price }],
    payment_method: 'Prepaid',
    sub_total: order.finalAmount - order.shippingCharges,
    length: product?.dimensions.length,
    breadth: product?.dimensions.breadth,
    height: product?.dimensions.height,
    weight: product.weight * order.quantity,
  };

  return retryRequest(async () => {
    const response = await axios.post('https://apiv2.shiprocket.in/v1/external/orders/create/adhoc', payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const shipmentId = response.data.shipment_id;

    const awbResponse = await axios.post('https://apiv2.shiprocket.in/v1/external/courier/assign/awb', { shipment_id: shipmentId }, {
      headers: { Authorization: `Bearer ${token}` },
    });

    await axios.post('https://apiv2.shiprocket.in/v1/external/courier/generate/label', { shipment_id: shipmentId }, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return {
      shiprocketOrderId: response.data.order_id,
      awbNumber: awbResponse.data.awb_code,
      trackingLink: `https://shiprocket.co/tracking/${awbResponse.data.awb_code}`,
    };
  });
};

module.exports = { fetchShippingRates, createShipment };
