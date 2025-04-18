const express = require("express");
const router = express.Router();
const { verifyAdmin ,authorize, verifyJWt} = require("../middleware/auth");
const {createSaasPlan,findAllWithSubscriptionPlans,findAllSaasPlan,findOnesaasPlan,updateSaasPlan,deleteSaasPlan} =require('../Controller/saas/saasPlanController.js');
const  {
    createSubscriptionPlan,
    FindByFrequency,
    subsFindAll,
    subsFindOne,
    deletePlanById,
  } =require('../Controller/saas/subscriptionPlanController.js');
  const {createOrder,createCashfreeCheckout,getOrderStatus} = require('../Controller/saas/saasOrderController.js');

router.post('/createPlan',verifyAdmin,authorize(['ADMIN']),createSaasPlan);
router.get('/with-subscription-plans', findAllWithSubscriptionPlans);

// Retrieve a single Product with id
router.get('/getOnePlan/:id', findOnesaasPlan);

// Update a Product with id
router.put('/updateplan/:id',verifyAdmin,authorize(['ADMIN']),updateSaasPlan);

// Delete a Product with id
router.delete('/deletePlan/:id',verifyAdmin,authorize(['ADMIN']), deleteSaasPlan);

router.post('/createSubsPlan',verifyAdmin,authorize(['ADMIN']),createSubscriptionPlan);
router.get('/getAllSubsplan',verifyJWt,authorize(['USER']),subsFindAll)
router.get('/getByIdSubsplan/:id',verifyJWt,authorize(['USER']),subsFindOne)
router.get('/getByFrequency',FindByFrequency)
router.delete('/deletePlanById/:id',verifyAdmin,authorize(['ADMIN']),deletePlanById);

router.post("/order" ,verifyJWt,authorize(['USER']),createOrder);
router.get("/cashfree/order-status", getOrderStatus); 
// ----------------Cashfree checkout routes-----------------------
router.post("/cashfree/checkout",verifyJWt,authorize(['USER']), createCashfreeCheckout);

module.exports = router;