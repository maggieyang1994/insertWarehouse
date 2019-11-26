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
const createPool = async () => {
  let pool = await mysql.createPool(tableConfig);
  return pool
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
const getDataFromWms = async (url, token) => {

  try {
    // console.time("getDataFromWms")
    var res = await axios({
      method: 'get',
      url,
      headers: {
        'Content-Type': 'application/hal+json',
        'Authorization': 'Bearer ' + token
      },
      timeout: 60000
    });
    // console.timeEnd("getDataFromWms")
    return res.data
  } catch (e) {
    // if (e.message.indexOf(404) !== -1) throw new Error(`404: can not find order`);
    throw `${e.message}----${url}`
  }

}

const insertData = async (connection, data, tableName, primaryObj, type, clientId) => {
  // console.time('insertData')
  let temp = [];
  let primaryKey = []
  await connection.beginTransaction();
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
    // 如果有 直接删除 再插入
    let [{ count }] = await connection.query(`select count(1) as count from ${tableName} where ${primaryKey}`);
    if (count) await connection.query(`delete from ${tableName} where ${primaryKey}`)
    // if (data.TransactionID === 144383) throw new Error("something wrong")
    let res = await connection.query(sqlStr);
    console.log(`table ${tableName} ${count ? 'update' : 'insert'} Success(orderId: ${data.TransactionID}------clientId: ${clientId}------customerCode:${data.CustomerName}------type:${type})`);
    totalCount++

    await connection.commit()
    // console.timeEnd('insertData')
  } catch (e) {
    // 发生错误 rollback  取消删除
    await connection.rollback();
    console.log('ERROR'.bgRed.black, `table ${tableName} insert fail: (orderId: ${data.TransactionID}------clientId: ${clientId}------customerCode:${data.CustomerName}------type:${type})------${e}`.red)
  }
}

const processChild = async (connection, originData, data, dataMap, tableName, primaryKeys, type, clientId) => {
  let tempList = []
  for (let j = 0; j < data.length; j++) {
    let tempObj = {};
    let primaryObj = {}
    for (var detailKey in dataMap) {
      // need default value
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
    primaryObj = primaryKeys.reduce((o, item) => { o[item] = tempObj[item]; return o }, {})
    tempList.push(insertData(connection, tempObj, tableName, primaryObj, type, clientId))
  }
  await Promise.all(tempList)
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
const main = async (connection, url, type, token, clientId) => {
  try {
    let processList = []
    let originData = await getDataFromWms(url, token);
    if (originData.TotalResults) {
      for (let i = 0; i < originData.ResourceList.length; i++) {
        let curData = originData.ResourceList[i];
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
          curData = {
            ...curData,
            ...tempObj
          }
        }
        if (type === 'outbound' || type === 'storage') {
          if (type === 'outbound' && curData.OrderItems && curData.OrderItems.length) curData['QtyOut'] = curData.OrderItems.reduce((o, item) => o += item.Qty, 0);
          curData['BillMonth'] = moment(curData.ReadOnly.ProcessDate).format("MM");
          curData['BillYear'] = moment(curData.ReadOnly.ProcessDate).format("YYYY")
        } else {
          if (curData.OrderItems && curData.OrderItems.length) curData['QtyIn'] = curData.ReceiveItems.reduce((o, item) => o += item.Qty, 0);
          curData['BillMonth'] = moment(curData.ArrivalDate).format("MM");
          curData['BillYear'] = moment(curData.ArrivalDate).format("YYYY")

        }
        processList.push(processChild(connection, curData, [curData], tableMap[type], 'ip_transactions', ['TransactionID', 'TransIDRef'], type, clientId));
      }
      await Promise.all(processList).catch(e => {
        console.log(e)
        // throw (e)
      })
    }
  } catch (e) {
    // throw (e)
    // error 不能中止进程
    console.log('ERROR'.bgRed.black, e)

  }

}
const getUrl = (fromDate, endDate, customerId, type) => {
  let urlConfig = {
    outbound: `https://secure-wms.com/orders?detail=all&rql=ReadOnly.ProcessDate=ge=${fromDate};ReadOnly.ProcessDate=le=${endDate};ReadOnly.CustomerIdentifier.Id==${customerId}`,
    storage: `https://secure-wms.com/inventory/adjustments?rql=ReadOnly.ProcessDate=ge=${fromDate};ReadOnly.ProcessDate=le=${endDate};ReadOnly.CustomerIdentifier.Id==${customerId}`,
    inbound: `https://secure-wms.com/inventory/receivers?rql=ArrivalDate=ge=${fromDate};ArrivalDate=le=${endDate};ReadOnly.CustomerIdentifier.Id==${customerId}`
  };
  return urlConfig[type]
}
const run = async () => {
  console.time('total')
  let pool = await createPool()
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
    let fromDate = moment([BillingYear, BillingMonth - 1]).startOf('month').format('YYYY-MM-DD');
    let endDate = moment([BillingYear, BillingMonth - 1]).endOf('month').format('YYYY-MM-DD');
    if (fromDate === 'Invalid date' || endDate === 'Invalid date') process.exit()
    // let fromDate = '2019-10-01';
    // let endDate = '2019-10-31'
    // let customerCode = ''
    // let type = ""
    console.time('getCutomer from dataBase')
    let customerCodes = await connection.query(`
      select 
      client_custom_cust_wms_id as customerId, ip_client_custom.client_id
      from ip_client_custom 
      join ip_clients on ip_clients.client_id = ip_client_custom.client_id and ip_clients.client_active = 1 
      ${customerCode ? `where client_custom_cust_pp_id = '${customerCode}'` : ''}`);
    console.timeEnd('getCutomer from dataBase')
    if (!customerCodes.length) {
      console.log(`customer doesn't exist or not active`)
      process.exit()
    }
    let types;
    if (type) {
      if (!tableMap[type]) (console.log(`${type} doesn't exist`), process.exit());
      types = [type]
    } else {
      types = Object.keys(tableMap)
    }
    // console.log(customerCodes, types)
    console.time('getToken')
    let token = await getToken();
    console.timeEnd('getToken')
    token = token.data.access_token;
    const mainList = []
    for (curType of types) {
      for (let curCustomer of customerCodes) {
        // console.log(`curCustomer.customerCode`)
        mainList.push(main(connection, getUrl(fromDate, endDate, curCustomer.customerId, curType), curType, token, curCustomer.client_id))
      }
    }
    await Promise.all(mainList).catch(e => {
      console.log(e)
      // 
    })
    console.timeEnd('total')
    console.log('DONE'.bgGreen.black, `totalCount: ${totalCount}`.green)

  } catch (e) {
    console.log(e)
  } finally {
    await connection.release()
    process.exit()
  }
}

run()


