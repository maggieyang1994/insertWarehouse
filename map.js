
module.exports = {
  tableConfig: {
    host: '127.0.0.1',
    user: 'root',
    password: 'Yt135212',
    database: '3pl'
  },
  chargeTypeMap: {
    1: 'Handling',
    2: 'Storage',
    3: 'PrepaidFreight',
    4: 'ThirdPartyFreight',
    5: 'SpecialCharges',
    6: 'Materials',
    7: 'AutoCalcStorage',
    8: 'AutoCalcHandling'
  },
  outBoundMap: {
    TransactionID: "ReadOnly/OrderId",
    Customer_Ref: 'ReferenceNum',
    CreateDate: "ReadOnly/CreationDate",
    ShipDate: "ReadOnly/ProcessDate",
    TrackingNumber: "RoutingInfo/TrackingNumber",
    CustomerID: "ReadOnly/CustomerIdentifier/Id",
    CustomerName: "ReadOnly/CustomerIdentifier/Name",
    BillMonth: "BillMonth",
    BillYear: "BillYear",
    QtyIn: {
      key: "QtyIn",
      default: 0
    },
    QtyOut: {
      key: "QtyOut",
      default: 0
    },
    Storage: {
      key: "Storage",
      default: 0
    },
    Handling: {
      key: "Handling",
      default: 0
    },
    Materials: {
      key: "Materials",
      default: 0
    },
    Special: {
      key: "Special",
      default: 0
    },
    Freight: {
      key: "Freight",
      default: 0
    },
    ChargeTotal: {
      key: "ChargeTotal",
      default: 0
    },
    UpdateDate: "UpdateDate",
    FacilityID: "ReadOnly/FacilityIdentifier/Id",
    TransactionType: {
      key: "ReadOnly/TransactionEntryType",
      default: 2
    },
    ValueAdded: {
      key: 'ValueAdded',
      default: 0
    },
    LockRecord: {
      key: 'LockRecord',
      default: 0
    },
    TransIDRef: {
      key: 'TransIDRef',
      default: ""
    }
  },
  inBoundMap: {
    TransactionID: "ReadOnly/ReceiverId",
    Customer_Ref: 'ReferenceNum',
    CreateDate: "ReadOnly/CreationDate",
    ShipDate: "ArrivalDate",
    TrackingNumber: "TrackingNumber",
    CustomerID: "ReadOnly/CustomerIdentifier/Id",
    CustomerName: "ReadOnly/CustomerIdentifier/Name",
    BillMonth: "BillMonth",
    BillYear: "BillYear",
    QtyIn: {
      key: "QtyIn",
      default: 0
    },
    QtyOut: {
      key: "QtyOut",
      default: 0
    },
    Storage: {
      key: "Storage",
      default: 0
    },
    Handling: {
      key: "Handling",
      default: 0
    },
    Materials: {
      key: "Materials",
      default: 0
    },
    Special: {
      key: "Special",
      default: 0
    },
    Freight: {
      key: "Freight",
      default: 0
    },
    ChargeTotal: {
      key: "ChargeTotal",
      default: 0
    },
    UpdateDate: "UpdateDate",
    FacilityID: "ReadOnly/FacilityIdentifier/Id",
    TransactionType: {
      key: "ReadOnly/TransactionEntryType",
      default: 1
    },
    ValueAdded: {
      key: 'ValueAdded',
      default: 0
    },
    LockRecord: {
      key: 'LockRecord',
      default: 0
    },
    TransIDRef: {
      key: 'TransIDRef',
      default: ""
    }
  },
  storageMap: {
    TransactionID: "ReadOnly/AdjustmentId",
    Customer_Ref: 'ReadOnly/ReferenceNum',
    CreateDate: "ReadOnly/CreationDate",
    ShipDate: "ReadOnly/ProcessDate",
    TrackingNumber: {
      key: "RoutingInfo/TrackingNumber",
      default: ""
    },
    CustomerID: "ReadOnly/CustomerIdentifier/Id",
    CustomerName: "ReadOnly/CustomerIdentifier/Name",
    BillMonth: "BillMonth",
    BillYear: "BillYear",
    QtyIn: {
      key: "QtyIn",
      default: 0
    },
    QtyOut: {
      key: "QtyOut",
      default: 0
    },
    Storage: {
      key: "Storage",
      default: 0
    },
    Handling: {
      key: "Handling",
      default: 0
    },
    Materials: {
      key: "Materials",
      default: 0
    },
    Special: {
      key: "Special",
      default: 0
    },
    Freight: {
      key: "Freight",
      default: 0
    },
    ChargeTotal: {
      key: "ChargeTotal",
      default: 0
    },
    UpdateDate: "UpdateDate",
    FacilityID: "ReadOnly/FacilityIdentifier/Id",
    TransactionType: {
      key: "ReadOnly/TransactionEntryType",
      default: 0
    },
    ValueAdded: {
      key: 'ValueAdded',
      default: 0
    },
    LockRecord: {
      key: 'LockRecord',
      default: 0
    },
    TransIDRef: {
      key: 'TransIDRef',
      default: ""
    }
  }
}