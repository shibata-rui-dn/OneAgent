export default function addNumbers(args) {
  if (typeof args.a !== 'number' || typeof args.b !== 'number') {
    throw new Error("引数a, bは数値である必要があります");
  }
  
  const result = args.a + args.b;
  
  return {
    content: [
      {
        type: "text",
        text: `計算結果: ${args.a} + ${args.b} = ${result}`
      }
    ]
  };
}