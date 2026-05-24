async function main() {
  const res = await fetch('http://localhost:3000/api/history');
  const text = await res.text();
  console.log("length:", JSON.parse(text).length);
}
main();
