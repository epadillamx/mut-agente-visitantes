require('dotenv').config();
const { DynamoDBClient, CreateTableCommand, DescribeTableCommand, DeleteTableCommand, waitUntilTableExists, waitUntilTableNotExists } = require('@aws-sdk/client-dynamodb');

// Configure AWS DynamoDB Client
const dynamodb = new DynamoDBClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const tableName = process.env.DYNAMODB_TABLE_INCIDENCIAS || 'incidencias';

const tableSchema = {
  TableName: tableName,
  KeySchema: [
    { AttributeName: 'id', KeyType: 'HASH' } // Partition key
  ],
  AttributeDefinitions: [
    { AttributeName: 'id', AttributeType: 'S' },
    { AttributeName: 'local_id', AttributeType: 'S' },
    { AttributeName: 'fecha_creacion', AttributeType: 'S' }
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'local_id-fecha_creacion-index',
      KeySchema: [
        { AttributeName: 'local_id', KeyType: 'HASH' },
        { AttributeName: 'fecha_creacion', KeyType: 'RANGE' }
      ],
      Projection: {
        ProjectionType: 'ALL'
      },
      ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5
      }
    }
  ],
  ProvisionedThroughput: {
    ReadCapacityUnits: 5,
    WriteCapacityUnits: 5
  },
  Tags: [
    {
      Key: 'Project',
      Value: 'WhatsApp-Flow-Incidencias'
    },
    {
      Key: 'Environment',
      Value: process.env.NODE_ENV || 'development'
    }
  ]
};

async function createTable() {
  try {
    console.log(`Creating DynamoDB table: ${tableName}...`);

    // Check if table already exists
    try {
      const describeCommand = new DescribeTableCommand({ TableName: tableName });
      const existingTable = await dynamodb.send(describeCommand);
      console.log(`Table ${tableName} already exists!`);
      console.log('Table status:', existingTable.Table.TableStatus);
      return;
    } catch (error) {
      if (error.name !== 'ResourceNotFoundException') {
        throw error;
      }
      // Table doesn't exist, continue with creation
    }

    // Create table
    const createCommand = new CreateTableCommand(tableSchema);
    const result = await dynamodb.send(createCommand);
    console.log('Table created successfully!');
    console.log('Table ARN:', result.TableDescription.TableArn);
    console.log('Table status:', result.TableDescription.TableStatus);
    console.log('\nWaiting for table to become ACTIVE...');

    // Wait for table to be active
    await waitUntilTableExists(
      { client: dynamodb, maxWaitTime: 300 },
      { TableName: tableName }
    );
    console.log(`Table ${tableName} is now ACTIVE and ready to use!`);

    // Display table details
    const describeCommand = new DescribeTableCommand({ TableName: tableName });
    const tableInfo = await dynamodb.send(describeCommand);
    console.log('\nTable Details:');
    console.log('- Table Name:', tableInfo.Table.TableName);
    console.log('- Item Count:', tableInfo.Table.ItemCount);
    console.log('- Table Size (bytes):', tableInfo.Table.TableSizeBytes);
    console.log('- Creation Date:', tableInfo.Table.CreationDateTime);
    console.log('\nGlobal Secondary Indexes:');
    tableInfo.Table.GlobalSecondaryIndexes.forEach(gsi => {
      console.log(`- ${gsi.IndexName} (${gsi.IndexStatus})`);
    });

  } catch (error) {
    console.error('Error creating table:', error.message);
    process.exit(1);
  }
}

async function deleteTable() {
  try {
    console.log(`Deleting DynamoDB table: ${tableName}...`);
    const deleteCommand = new DeleteTableCommand({ TableName: tableName });
    await dynamodb.send(deleteCommand);
    console.log('Table deletion initiated. Waiting for completion...');

    await waitUntilTableNotExists(
      { client: dynamodb, maxWaitTime: 300 },
      { TableName: tableName }
    );
    console.log(`Table ${tableName} deleted successfully!`);
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      console.log(`Table ${tableName} does not exist.`);
    } else {
      console.error('Error deleting table:', error.message);
      process.exit(1);
    }
  }
}

// CLI handling
const command = process.argv[2];

if (command === 'create') {
  createTable();
} else if (command === 'delete') {
  deleteTable();
} else {
  console.log('DynamoDB Table Management Script');
  console.log('='.repeat(50));
  console.log('Usage:');
  console.log('  node scripts/create-dynamodb-table.js create   - Create table');
  console.log('  node scripts/create-dynamodb-table.js delete   - Delete table');
  console.log('='.repeat(50));
  process.exit(1);
}
