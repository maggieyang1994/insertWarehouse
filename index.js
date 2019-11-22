let axios = require("axios")
let mysql = require("promise-mysql")
let moment = require("moment")
const program = require('commander');
const { chargeTypeMap, outBoundMap, inBoundMap, storageMap, tableConfig} = require('./map.js')
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
      'Authorization': 'Basic ' + 'YmY3MmNiMWMtOTFkMi00YTNjLTlkM2MtNWVkNDRlMzFmYWQwOmM2Ykd3ekw0bzB0WUhsMThKaW16eDB3U0VxcUJwbVhw'
    },
    data: {
      "grant_type": "client_credentials",
      "tpl": "{dbd6ed1f-72c7-44c8-be5d-23c16183d2e1}",
      "user_login_id": "1"
    }
  });
}
const getDataFromWms = async (url) => {
  try {
    let token = await getToken();
    var res = await axios({
      method: 'get',
      url,
      headers: {
        'Content-Type': 'application/hal+json',
        'Authorization': 'Bearer ' + token.data.access_token
      }
    });
    return res.data
  } catch (e) {
    // if (e.message.indexOf(404) !== -1) throw new Error(`404: can not find order`);
    throw e.message
  }

}

const insertData = async (connection, data, tableName, primaryObj) => {
  let temp = [];
  let primaryKey = []
  // orderId 29413 "CompanyName": "Watson's", 需要转义单引号
  for (var key in data) {
    let tempValue = data[key];
    if (typeof tempValue === 'string') tempValue = tempValue.replace("'", "\\'")
    temp.push(`${key} = '${tempValue}'`)
  };
  for(var key in primaryObj){
    primaryKey.push(`${key} = '${primaryObj[key]}'`)
  }
  primaryKey = primaryKey.join("and ")
  let sqlStr = `insert into ${tableName} set ${temp.join(',')}`;
  try {
    // 如果有 直接删除 再插入
    let [{count}] = await connection.query(`select count(1) as count from ${tableName} where ${primaryKey}`);
    if(count) await connection.query(`delete from ${tableName} where ${primaryKey}`)
    let res = await connection.query(sqlStr);
    console.log(`table ${tableName} ${count ? 'update' : 'insert'} Success(orderId: ${data.TransactionID})`)
  } catch (e) {
    // 发生错误 rollback
    throw new Error(`table ${tableName} insert fail: ${e}(orderId: ${data.TransactionID})`)
  }
}

const processChild = async (connection, originData, data, dataMap, tableName, primaryKeys) => {
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
    primaryObj = primaryKeys.reduce((o, item) => {o[item] = tempObj[item]; return o}, {})
    await insertData(connection, tempObj, tableName, primaryObj)
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
const main = async (url, type) => {
  console.log(`${type} start`);
  let pool = await createPool()
  let connection = await pool.getConnection()
  await connection.beginTransaction();
  try {
    let originData = await getDataFromWms(url);
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
        await processChild(connection, curData, [curData], tableMap[type], 'ip_transactions', ['TransactionID', 'TransIDRef'])
      }
    }
    await connection.commit();
  } catch (e) {
    await connection.rollback();
    throw (e)
  } finally {
    await connection.release()
  }

}
program
  .version('1.0.0')
  .option('-y, --year <BillingYear>', 'BillingYear')
  .option('-m, --month <BillingMonth>', 'BillingMonth')
  .option('-i, --customerId <customerId>', 'customerId')
  .option('-t, --type <type>', 'type')
  .parse(process.argv);
let { year: BillingYear, month: BillingMonth, customerId, type } = program;
console.log(BillingYear, BillingMonth, customerId, type)
if (!(BillingYear && BillingMonth && customerId && type) || !/^(outbound|storage|inbound)$/.test(type)) process.exit();
let fromDate = moment([BillingYear, BillingMonth - 1]).startOf('month').format('YYYY-MM-DD');
let endDate = moment([BillingYear, BillingMonth - 1]).endOf('month').format('YYYY-MM-DD');
// console.log(fromDate, endDate)
if (fromDate === 'Invalid date' || endDate === 'Invalid date') process.exit()
// let  fromDate = '2019-10-01'
// let  endDate = '2019-10-31'
// let  customerId = 7
// let  type = "storage"
let urlConfig = {
  outbound: `https://secure-wms.com/orders?detail=all&rql=ReadOnly.ProcessDate=ge=${fromDate};ReadOnly.ProcessDate=le=${endDate};ReadOnly.CustomerIdentifier.Id==${customerId}`,
  storage: `https://secure-wms.com/inventory/adjustments?rql=ReadOnly.ProcessDate=ge=${fromDate};ReadOnly.ProcessDate=le=${endDate};ReadOnly.CustomerIdentifier.Id==${customerId}`,
  inbound: `https://secure-wms.com/inventory/receivers?rql=ArrivalDate=ge=${fromDate};ArrivalDate=le=${endDate};ReadOnly.CustomerIdentifier.Id==${customerId}`
}
main(urlConfig[type], type).then(() => {
  console.log('done');
  process.exit()
}).catch(e => {
  console.log(e);
  process.exit()
})

