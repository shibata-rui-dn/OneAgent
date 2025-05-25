export default function processString(args) {
  const { text, operation } = args;
  
  if (typeof text !== 'string') {
    throw new Error("引数textは文字列である必要があります");
  }
  
  let result;
  let description;
  
  switch (operation) {
    case 'length':
      result = text.length;
      description = `文字列の長さ: ${result}`;
      break;
    case 'uppercase':
      result = text.toUpperCase();
      description = `大文字変換: ${result}`;
      break;
    case 'lowercase':
      result = text.toLowerCase();
      description = `小文字変換: ${result}`;
      break;
    case 'reverse':
      result = text.split('').reverse().join('');
      description = `逆順変換: ${result}`;
      break;
    default:
      throw new Error(`未対応の操作: ${operation}`);
  }
  
  return {
    content: [
      {
        type: "text",
        text: description
      }
    ]
  };
}