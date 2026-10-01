export async function withTransaction(database, operation) {
  return database.transaction((transaction) => operation(transaction), {
    isolationLevel: 'read committed',
  });
}
