/**
 * readme：
 * 0. env: node yarn。（install yarn https://yarn.bootcss.com/docs/install/#debian-stable ）
 *    curl http://localhost:3000/isClaim?account=0xcC2847AB347A4752a233e20b7E4410e138f096F6
 *    curl http://localhost:3000/boxRemaining
 *    curl http://localhost:3000/claim?account=0x3E9dC7E01CAE9B5E1F39390314C2A41C386CdD5e
 */
 var fs = require('fs');
 const http = require('http');
 const querystring = require("querystring");
 const args = require('minimist')(process.argv.slice(2))
 var accountConfig = require("./.account.json");
 var Web3 = require('web3');
const alchemyKey = fs.readFileSync("./.alchemyKey").toString().trim();
var web3 = new Web3(`https://polygon-mainnet.g.alchemy.com/v2/`+alchemyKey);
const ERC20ABI = [{"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"transfer","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"}];
 
var claimedAccountPath = './claimedAccount.txt'
var boxRemainingPath = './boxRemaining.txt'

const mooETH = "0x7c91f7aae5fb61e243861e45badc15bc8c87eb05"
const mooUSD = "0xf3cdbd4877e23da9ceafad894195f26efed5e38a"

 var CHAIN_ID;
 var port;
 
 const server = http.createServer();
 
 init().then(() => serverStart())
     .catch(error => {
         console.error(error);
         process.exit(1);
     });

   
 async function init(){
     port = args['port'];
     CHAIN_ID = args['chainId'];
     const netMap = new Map([['1', 'mainnet'], ['3', 'ropsten'], ['4', 'rinkeby'],['137', 'polygon']]);
     var network = netMap.get(CHAIN_ID+'')
     console.log(`http://localhost:${port} \n network is ${network}`);
    
 }

 function serverStart () {
     server.on('request', async (req, res) => {

        var path = querystring.parse(req.url.split("?")[0]);
        
        if(JSON.stringify(path).search('/isClaim') != -1){  // query is claim 
            var paramObject = querystring.parse(req.url.split("?")[1]);
            account = paramObject.account
            console.log("account");
            var claimStatus = isClaim(account);
            res.end(JSON.stringify({"isClaim":claimStatus})); 
                
        }else if(JSON.stringify(path).search('/boxRemaining') != -1){  // query box reaming
            var lines = readByLine(boxRemainingPath);
            console.log(`boxRemaining {} `,lines[0]);
            res.end(JSON.stringify({"remaining": parseInt(lines[0])})); 
        }else if(JSON.stringify(path).search('/claim') != -1){  // claim
            var paramObject = querystring.parse(req.url.split("?")[1]);
            account = paramObject.account
            var claimStatus = isClaim(account);
            if(claimStatus){
                res.end(JSON.stringify({"claimStatus":"false","reason":"alreay claim"})); 
            }else{
                var ethAmount = (100*1e18).toString()
                var usdAmount = (50000*1e6).toString()
                var maticAmount =  (0.01*1e18).toString()
                var remaining = parseInt(readByLine(boxRemainingPath)[0]);
                if(remaining <= 0){
                    console.log("remaining not enough")
                    res.end(JSON.stringify({"claimStatus":"false","reason":" claim remaining no enough remaining = "+remaining})); 
                }else{
                    remaining--;
                    // update remaing box num and add claim account
                    fs.writeFileSync(boxRemainingPath, remaining)
                    // 
                    fs.appendFile(claimedAccountPath, account+"\n", function (err) {
                        if (err) {
                          console.log("append account error"+account)
                        } else {
                            console.log("append account done"+account)
                        }
                    })
                    var res1 = await transfer(accountConfig[0].pk,mooETH,account,ethAmount,accountConfig[0].account)
                    var res2 = await transfer(accountConfig[0].pk,mooUSD,account,usdAmount,accountConfig[0].account)
                    var res3 = await sendTx(account,maticAmount,null,accountConfig[0].pk,accountConfig[0].account)
                    console.log(`res1 {}`,res1.transactionHash)
                    console.log(`res2 {}`,res2.transactionHash)
                    console.log(`res3 {}`,res3.transactionHash)
                  
                    res.end(JSON.stringify({"claimStatus":"true","MaticTx":res3.transactionHash,"EthTx":res1.transactionHash,"UsdTx":res2.transactionHash}));
                }
            }
            
        }
        
     });
     server.listen(port);    
 }

 function readByLine(path){
    let lines;
    try {
        const data = fs.readFileSync(path, 'UTF-8');
        lines = data.split(/\r?\n/);
    } catch (err) {
        console.error(err);
    }

    // lines.forEach((line) => console.log(line));
    return lines;
 }

 function isClaim(account){
    var lines = readByLine(claimedAccountPath);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if(line.trim().toLowerCase() == account.trim().toLowerCase()){
            console.log(`account {} already claim`,account);
            return true;
        }
    }
    return false;
 }
 
 async function getNonce(account){
    let nonce = await web3.eth.getTransactionCount(account);
    console.log('nonce = ', nonce)
    return nonce;
}



async function transfer(privateKey,ERC20_ADDRESS,transferTo,transferAmount,fromAccount) {
    const ERC20contract = new web3.eth.Contract(ERC20ABI, ERC20_ADDRESS);
    var encodeABI = ERC20contract.methods.transfer(transferTo, transferAmount).encodeABI();
    return await sendTx(ERC20_ADDRESS,0,encodeABI,privateKey,fromAccount);
}


async function sendTx(to,value,encodeABI,privateKey,fromAccount){
    var signResult = await web3.eth.accounts.signTransaction({
        gas: 3000000,
        to: to,
        nonce: await getNonce(fromAccount),
        value: value,
        data: encodeABI
    }, privateKey);
    
    // console.log(signResult);
    var txRes = await web3.eth.sendSignedTransaction(signResult.rawTransaction);
    return txRes;
}