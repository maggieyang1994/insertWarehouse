let axios = require("axios")
let mysql = require("promise-mysql")
let moment = require("moment")
const color = require('colors')
const program = require('commander');
const { chargeTypeMap, outBoundMap, inBoundMap, storageMap, tableConfig } = require('./map.js');
let totalCount = 0
const tableMap = {
  outbound: outBoundMap,
  inbound: inBoundMap,
  storage: storageMap
}

const safeGet = (o, path) => {
  try {
    return path.split('/').reduce((o, k) => o[k], o)
  } catch (e) {
    return undefined
  }
};

const getToken = () => {
  return axios({
    method: 'post',
    url: 'http://secure-wms.com/AuthServer/api/Token',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + 'NWI1YTcxNTUtNjhiNy00YzFjLWI2MWMtMWU0ODUzZTlhNzczOnJNK1U2SWMwZnI3ZUZ3QXFtMXRYalRmL3pDVEJYaFhK'
    },
    data: {
      "grant_type": "client_credentials",
      "tpl": "{dbd6ed1f-72c7-44c8-be5d-23c16183d2e1}",
      "user_login_id": "1"
    }
  });
}

const getDataFromWmsTime = []
const getDataFromWms = async (url, token) => {
  try {
    const timer = Date.now()
    var res = await axios({
      method: 'get',
      url,
      headers: {
        'Content-Type': 'application/hal+json',
        'Authorization': 'Bearer ' + token
      },
      // timeout: 60000
    });
    getDataFromWmsTime.push(Date.now() - timer)
    return res.data
  } catch (e) {
    // if (e.message.indexOf(404) !== -1) throw new Error(`404: can not find order`);
    throw `${e.message}----${url}`
  }

}

const insertDataTimr = []
const insertData = async (connection, data, tableName, primaryObj, type, clientId) => {
  let temp = [];
  let primaryKey = []
  // await connection.beginTransaction();

  // orderId 29413 "CompanyName": "Watson's", 需要转义单引号
  for (var key in data) {
    let tempValue = data[key];
    if (typeof tempValue === 'string') tempValue = tempValue.replace("'", "\\'")
    temp.push(`${key} = '${tempValue}'`)
  };

  for (var key in primaryObj) {
    primaryKey.push(`${key} = '${primaryObj[key]}'`)
  }
  primaryKey = primaryKey.join("and ")

  let sqlStr = `insert into ${tableName} set ${temp.join(',')}`;
  try {
    const time = Date.now()
    // 如果有 update  else insert
    let [{ count }] = await connection.query(`select count(1) as count from ${tableName} where ${primaryKey}`);
    if (count) sqlStr = `update  ${tableName} set ${temp.join(',')} where ${primaryKey}`


    await connection.query(sqlStr);
    insertDataTimr.push(Date.now() - time)
    // console.log('Insert success', Date.now() - time)
    return {
      code: 1,
      msg: `table ${tableName} ${count ? 'update' : 'insert'} Success(orderId: ${data.TransactionID}------clientId: ${clientId}------customerCode:${data.CustomerName}------type:${type})`
    }
    // totalCount++

    // await connection.commit()
  } catch (e) {
    return {
      code: -1,
      msg: `table ${tableName} insert fail: (orderId: ${data.TransactionID}------clientId: ${clientId}------customerCode:${data.CustomerName}------type:${type})------${e}`
    }
  }
}

const processChild = async (connection, data, dataMap, tableName, primaryKeys, type, clientId) => {
  for (let j = 0; j < data.length; j++) {
    let tempObj = {};
    for (var detailKey in dataMap) {
      let isObject = typeof dataMap[detailKey] === 'object'
      let tempValue = safeGet(data[j], isObject ? dataMap[detailKey].key : dataMap[detailKey]);
      if (tempValue !== undefined) {
        tempObj[detailKey] = tempValue
      } else if (isObject) tempObj[detailKey] = dataMap[detailKey].default
    }
    tempObj = {
      ...tempObj,
      UpdateDate: moment().format('YYYY-MM-DD HH:mm:ss')
    }

    let primaryObj = {}
    primaryObj = primaryKeys.reduce((o, item) => { o[item] = tempObj[item]; return o }, {})
    return insertData(connection, tempObj, tableName, primaryObj, type, clientId)
  }
}

const calcChargeType = (billings, chargeTypeMap, chargeObj, type) => {
  billings.forEach(x => {
    switch (chargeTypeMap[x.ChargeType]) {
      case 'Handling':
      case 'AutoCalcHandling':
        chargeObj.Handling += x.Subtotal;
        chargeObj.ChargeTotal += x.Subtotal
        break;
      case 'PrepaidFreight':
      case 'ThirdPartyFreight':
        chargeObj.Freight += x.Subtotal;
        chargeObj.ChargeTotal += x.Subtotal
        break;
      case 'Storage':
        if (type !== 'storage') {
          chargeObj.Storage += x.Subtotal;
          chargeObj.ChargeTotal += x.Subtotal
        }
        break;
      case 'AutoCalcStorage':
        if (type === 'storage') {
          chargeObj.Storage += x.Subtotal;
          chargeObj.ChargeTotal += x.Subtotal
        }
        break;
      case 'Materials':
        chargeObj.Materials += x.Subtotal;
        chargeObj.ChargeTotal += x.Subtotal
        break;
      case 'SpecialCharges':
        chargeObj.Special += x.Subtotal;
        chargeObj.ChargeTotal += x.Subtotal
        break;
    }

  })
  return chargeObj
}


const typeTask = async (connection, curCustomer, type, token) => {
  console.log(`${curCustomer.clientId}:${curCustomer.client_name}:${type} start`)
  let url = getUrl(curCustomer.customerId, type)
  let originData = await getDataFromWms(url, token)
  if (!originData || !originData.TotalResults) {
    console.log(`${curCustomer.clientId}:${curCustomer.client_name}:${type} - has no data`);
    return
  }

  return originData.ResourceList.map(curData => {
    let billings = safeGet(curData, "Billing/BillingCharges");
    if (billings && billings.length) {
      let tempChargeObj = {
        Handling: 0,
        Storage: 0,
        Freight: 0,
        Materials: 0,
        Special: 0,
        ChargeTotal: 0
      }
      let tempObj = calcChargeType(billings, chargeTypeMap, tempChargeObj, type);
      curData = { ...curData, ...tempObj }
    }

    if (type === 'outbound' || type === 'storage') {
      if (type === 'outbound' && curData.OrderItems && curData.OrderItems.length) curData['QtyOut'] = curData.OrderItems.reduce((o, item) => o += item.Qty, 0);
      curData['BillMonth'] = moment(curData.ReadOnly.ProcessDate).format("MM");
      curData['BillYear'] = moment(curData.ReadOnly.ProcessDate).format("YYYY")
    }

    else {
      if (curData.OrderItems && curData.OrderItems.length) curData['QtyIn'] = curData.ReceiveItems.reduce((o, item) => o += item.Qty, 0);
      curData['BillMonth'] = moment(curData.ArrivalDate).format("MM");
      curData['BillYear'] = moment(curData.ArrivalDate).format("YYYY")
    }

    return processChild(connection, [curData], tableMap[type], 'ip_transactions', ['TransactionID', 'TransIDRef'], type, curCustomer.clientId)
  })
}

const main = async (pool, token, curCustomer) => {
  let connection = await pool.getConnection()
  await connection.beginTransaction();
  let mainList = [].concat(...types.map(key => typeTask(connection, curCustomer, key, token)))
  await Promise.all(mainList).then(res => {
    return Promise.all([].concat(...res.filter(x => x)))
  }).then(res => {
    if (res.every(x => x.code === 1)) {
      console.log(res.map(x => x.msg).join("\n"))
      totalCount += res.length;
      connection.commit()
    } else {
      throw new Error(res.filter(x => x.code === -1).map(x => x.msg).join("\n"))
    }
  }).catch(e => {
    console.log(e)
    e.message && (console.log(`${curCustomer.clientId}:${curCustomer.client_name} Rollback all`.bgRed), connection.rollback()) 
  });
  await connection.release()
}

const getUrl = (customerId, type) => {
  let urlConfig = {
    outbound: `https://secure-wms.com/orders?detail=all&rql=ReadOnly.ProcessDate=ge=${fromDate};ReadOnly.ProcessDate=le=${endDate};ReadOnly.CustomerIdentifier.Id==${customerId}`,
    storage: `https://secure-wms.com/inventory/adjustments?rql=ReadOnly.ProcessDate=ge=${fromDate};ReadOnly.ProcessDate=le=${endDate};ReadOnly.CustomerIdentifier.Id==${customerId}`,
    inbound: `https://secure-wms.com/inventory/receivers?rql=ArrivalDate=ge=${fromDate};ArrivalDate=le=${endDate};ReadOnly.CustomerIdentifier.Id==${customerId}`
  };
  return urlConfig[type]
}

const run = async () => {
  console.log('start')
  console.time('total')
  let pool = await mysql.createPool(tableConfig)
  let connection = await pool.getConnection()

  try {
    program
      .version('1.0.0')
      .option('-y, --year <BillingYear>', 'BillingYear')
      .option('-m, --month <BillingMonth>', 'BillingMonth')
      .option('-i, --customerCode <customerCode>', 'customerCode')
      .option('-t, --type <type>', 'type')
      .parse(process.argv);
    let { year: BillingYear, month: BillingMonth, customerCode, type } = program;
    console.log(BillingYear, BillingMonth, customerCode, type)
    if (!(BillingYear && BillingMonth)) process.exit();
    fromDate = moment([BillingYear, BillingMonth - 1]).startOf('month').format('YYYY-MM-DD');
    endDate = moment([BillingYear, BillingMonth - 1]).endOf('month').format('YYYY-MM-DD');
    if (fromDate === 'Invalid date' || endDate === 'Invalid date') process.exit()

    customerCodes = await connection.query(`
      select 
      client_custom_cust_wms_id as customerId, ip_client_custom.client_id as clientId, ip_clients.client_name
      from ip_client_custom 
      join ip_clients on ip_clients.client_id = ip_client_custom.client_id and ip_clients.client_active = 1 
      ${customerCode ? `where client_custom_cust_pp_id = '${customerCode}'` : ''}`);

    if (!customerCodes.length) {
      process.exit()
    }


    if (type) {
      if (!tableMap[type]) (console.log(`${type} doesn't exist`), process.exit());
      types = [type]
    } else {
      types = Object.keys(tableMap)
    }

    let token = await getToken();
    token = token.data.access_token;

    const mainList = []
    // for (curType of types) {
    for (let curCustomer of customerCodes) {
      // const url = getUrl(fromDate, endDate, curCustomer.customerId, curType)
      mainList.push(main(pool, token, curCustomer))
    }
    // }
    await Promise.all(mainList).catch(console.error)
    console.log('the last time of get data form wms', getDataFromWmsTime[getDataFromWmsTime.length - 1])
    console.timeEnd('total')
    console.log('DONE'.bgGreen.black, `totalCount: ${totalCount}`.green)

  } catch (e) {
    console.log(e)
  } finally {
    await connection.release()
    process.exit()
  }
}
let fromDate = '';
let endDate = '';
let customerCode = ''
let types = ""
run()
// 一个customerCode 对应  一个main   promise.all 并发
// 一个main  对应多个 typetask       promise.all 并发
// 一个type task 对应  多个 processChild  
// 一个processChild 对应一个insertData


