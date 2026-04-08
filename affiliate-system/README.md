cd affiliate-system/affiliate-kafka-consumer
cp .env.example .env   # fill in values
npm install
clickhouse-client --multiquery < scripts/create_table.sql  # one-time table creation
npm start