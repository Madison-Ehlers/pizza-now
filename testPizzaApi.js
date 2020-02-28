var pizzapi = require('dominos');
var AWS = require("aws-sdk");
AWS.config.update({region:'us-east-1'});
const util = require('util');

const creditCardNumber = process.env.CREDIT_CARD;
const securityCode = process.env.SECURITY_CODE;
const firstName = process.env.FIRST_NAME;
const lastName = process.env.LAST_NAME;
const address = process.env.ADDRESS;
const phone = process.env.PHONE;
const email = process.env.EMAIL;
const expiration = process.env.CREDIT_CARD_EXP;
const zip = process.env.ZIP;
const storeId = process.env.STORE_ID;

var myTable = 'PizzaOrders';
var ddb = new AWS.DynamoDB({apiVersion: '2012-08-10'});

const getDbItem = (params) => {
    return new Promise((resolve, reject) => {
        ddb.getItem(params, (err, data) => {
            if (err) {
                console.log("Error", err);
                reject(err);
            } else {
                if (data.Item == null) {
                     // console.log("Success", data);
                     resolve(data);
                }
                else {
                     // console.log("You already got a pizza", data);
                     reject("You already got a pizza")
                }
            }
          });
    });
}

const post = (params) => {
    return new Promise((resolve, reject) => {
        ddb.putItem(params, function(err, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
 }


const log = (data) => {
    console.log(util.inspect(data, false, null))
}

var myStore = new pizzapi.Store({ID: storeId}); // The closest store to my location

const getCustomerInformation = () => {
    var me = new pizzapi.Customer(
        {
            firstName,
            lastName,
            address,
            phone,
            email
        }
    );
    return me;
}

const getPizza = (pizzaName) => {
    return new Promise((resolve, reject) => {
        try {
            myStore.getFriendlyNames(menu => {
                const pizza = menu.result
                .filter(item => Object.keys(item)[0].includes(pizzaName))
                .map(item => item[Object.keys(item)[0]])[0];
    
                var meatPizza = new pizzapi.Item(
                    {
                        code: pizza,
                        options: [],
                        quantity: 1
                    }
                  );
                resolve(meatPizza);
            })
           
        } catch (e) {
            reject(e)
        }
        
    });
}

const createOrder = (pizzaItem, customer) => {
    return new Promise((resolve, reject) => {
        try {
            var order = new pizzapi.Order(
                {
                    customer,
                    storeID: myStore.ID,
                    deliveryMethod: 'Delivery'
                }
            );

            order.Address = new pizzapi.Address(address);
            order.StoreID = 1720;
            order.StoreOrderID = order.StoreId;

            var cardInfo = new order.PaymentObject();
            cardInfo.Number = creditCardNumber;
            cardInfo.CardType = order.validateCC(creditCardNumber);
            cardInfo.Expiration = expiration;
            cardInfo.SecurityCode = securityCode;
            cardInfo.PostalCode = zip;
            log(cardInfo);

            order.addItem(pizzaItem);
            cardInfo.Amount = order.Amounts.Customer;
            order.Payments.push(cardInfo);

            resolve(order);
        } catch (e) {
            reject(e);
        }
    });
}

const validateOrder = (order) => {
    return new Promise((resolve, reject) => {
        try {
            order.validate(result => {
                resolve(result);
            })
        }
        catch (e) {
            reject(e);
        }
    });
}


const getPostParams = (dateString) => {
    return {
        TableName: myTable,
        Item: {
            "OrderDate" : {
                S: dateString
            },
            "Message" :{
                S: "Pizza Ordered"
            }
        }
    }
  };


var params = (dateString) => {
    return {
        TableName : myTable,
        Key : {
            'OrderDate': { S: dateString }
        }
    }
}

var usaTime = new Date().toLocaleString("en-US", {timeZone: "America/Chicago"});
usaTime = new Date(usaTime);

const dateString = usaTime.getMonth() + 1  + "-" + usaTime.getDate() + "-" + usaTime.getFullYear();
console.log('USA time: ' + dateString);

getDbItem(params(dateString)) // validate we didnt already do this today...
    .then(() => {
        return getPizza("Large (14\") Hand Tossed Ultimate Pepperoni");
    })
    .then(pizza => {

        console.log('pizza', pizza)
        const customerInfo = getCustomerInformation();
        log(customerInfo)
        return createOrder(pizza, customerInfo);
    })
    .then((order) => {
        return validateOrder(order);
    })
    .then((orderPlacedResult) => {
        log(orderPlacedResult);
        post(getPostParams(dateString)); // save a record to ensure we don't order more than one per day. 
    })
    .catch(err => {
        console.log('error: ', err);
    });

