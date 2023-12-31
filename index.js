const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mysql = require('mysql');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const { Chess } = require('chess.js')
const base64 = require('base64url');
const winston = require('winston');


//############################################################################################
//########################### LOGGER  STARTS #################################################

const { format, transports } = winston
const path = require('path')
const ONE = 1;
const logFormat = format.printf(info => `${info.timestamp} ${info.level} [${info.label}]: ${info.message}`)

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: format.combine(
    format.label({ label: path.basename(process.mainModule.filename) }),
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    // Format the metadata object
    format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] })
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        logFormat
      )
    }),
    new transports.File({
      filename: 'logs/combined.log',
      format: format.combine(
        // Render in one line in your log file.
        // If you use prettyPrint() here it will be really
        // difficult to exploit your logs files afterwards.
        format.json()
      )
    })
  ],
  exitOnError: false
})
//############################################################################################
//########################### LOGGER  ENDS #################################################


// Load environment variables from .env file
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// MySQL database connection configuration
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

var connection;
var db_config = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
};
function handleDisconnect() {
  connection = mysql.createConnection(db_config); // Recreate the connection, since
                                                  // the old one cannot be reused.

  connection.connect(function(err) {              // The server is either down
    if(err) {                                     // or restarting (takes a while sometimes).
       logger.error('error when connecting to db:', JSON.stringify(err));
      setTimeout(handleDisconnect, 2000); // We introduce a delay before attempting to reconnect,
    }                                     // to avoid a hot loop, and to allow our node script to
  });                                     // process asynchronous requests in the meantime.
                                          // If you're also serving http, display a 503 error.
  connection.on('error', function(err) {
    logger.error('db error', JSON.stringify(err));
    if(err.code === 'PROTOCOL_CONNECTION_LOST') { // Connection to the MySQL server is usually
      handleDisconnect();                         // lost due to either server restart, or a
    } else {                                      // connnection idle timeout (the wait_timeout
      throw err;                                  // server variable configures this)
    }
  });
}
handleDisconnect();



// Connect to the database
db.connect((err) => {
  if (err) {
    logger.error("Error connecting to Error connecting to MySQL database:", JSON.stringify(err));
    return;
  }
  logger.info("Connected to MySQL database");
});

// Middleware function to validate JWT token
const authenticateToken = (token) => {
  try {
    logger.debug(`authetication started of jwt token ${token}`, token);
    const decoded = jwt.verify(token, "javainuse", { algorithms: ['HS256'], encoding: 'utf-8' });
    return decoded;
  } catch (error) {
    logger.error(`JWT Token validation error with ${error} returning null` ,error);
    return null;
  }
};

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});
var position = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
var matchDuration = 399;

io.on('connection', (socket) => {
  logger.info('connection estabished');

  socket.on('move', (data) => {
      logger.debug("Move event received: " + JSON.stringify(data));
      const jwtParts = data.auth.split('.');
      const headerInBase64UrlFormat = jwtParts[0];
      payloadInBase64UrlFormat = jwtParts[1];
      const signatureInBase64UrlFormat = jwtParts[2];

    // Validate JWT token
    const tokenData = authenticateToken(data.auth);

    if (tokenData) {
      // Token is valid, handle the move event logic here
      logger.info('User authenticated!!!');

    // VALIDATE THE SECRET LATER
    position = data;
    var game = new Chess(data.prevFen);
    const move = game.move({
        from: data.source,
        to: data.target,
        promotion: 'q' // NOTE: always promote to a queen for example simplicity
    })

      // illegal move
    if (move === null) {
      logger.error("illegal move")
    }else{
      var userName1Obj = JSON.parse(base64.decode(payloadInBase64UrlFormat));
      game = new Chess(data.fen);
      if (game.in_checkmate()) {
        status = 'CONCLUDED'
      } else if (game.in_draw()) {
        status = 'DRAW'
      } else {
        status = 'RUNNING'
      }
      if(data.gameOver) {
        logger.debug('game over');
        return;
      }
      var userName1 = userName1Obj.sub;
      var userName2 = "";
      var eventId = '';
      var matchId = data.matchId;
      var challengeId = '';
      var pgn = data.pgn;
      var fen = data.fen;
      var target = data.target
      var source = data.source
      logger.debug(pgn);
        if (true) {
            connection.beginTransaction(function(err) {
                var query = "select * from ?? where matchId = ?  order by id desc limit 2";
                var table = ["move" , matchId];
                query = mysql.format(query, table);
                connection.query(query, function (err, rows) {
                    if (err) {
                      logger.error("Error while connecting to db " + JSON.stringify(err));
                      return;
                    } else {
                        if(rows.length > 0){
                          var gameStatus = rows[0].status;
                          var userNameOfLastMoved = rows[0].userName1;
                          var userNameOfCurrentMove =  userName1;
                          var totalMovesMadeSoFarInGame= rows.length;
                          if( gameStatus === 'CONCLUDED'){
                            return;
                          }
                          if(userNameOfLastMoved===userNameOfCurrentMove)
                            return
                          if(totalMovesMadeSoFarInGame == ONE){
                            logger.info("only one move case executing..!!!");
                            timeStamp = new Date().getTime()/1000;
                            var s = new Date(rows[0].time)
                            var s2 = new Date(s.getTime()+(330*60000));
                            time = matchDuration - ((new Date().getTime() - s2.getTime())/1000);
                          } else if(totalMovesMadeSoFarInGame > ONE) {
                            logger.info("more than one move case executing..!!!");
                            timeStamp = new Date().getTime()/1000;
                            last_remaining_time = rows[1].minute_left;
                            var s = new Date(rows[0].time)
                            var s2 = new Date(s.getTime()+(330*60000));
                            time = last_remaining_time - ((new Date().getTime() - s2.getTime())/1000);
                          }
                          var s = new Date(rows[0].time)

                        } else {
                          time = matchDuration;
                          timeStamp = new Date().getTime()/1000;
                        }
                    }
                query = "insert into ?? (`userName1`,`userName2`,`eventId`, `matchId`, `challengeId`, `pgn`, `fen`, `time`, `source`, `target`, `status`, `minute_left`) values(?,?,?,?,?,?,?, FROM_UNIXTIME(?), ? ,?, ?, ?)";
                table = ["move" , userName1, userName2, eventId, matchId, challengeId, pgn, fen, timeStamp ,source, target, status, time ];
                query = mysql.format(query, table);
                logger.debug(query);
                connection.query(query, function (err, rows) {
                    if (err) {
                        logger.error("DB ERROR ",JSON.stringify(err));
                    } else {
                        connection.commit(function(err) {
                            if (err) { 
                                connection.rollback(function() {
                                  logger.error("error rollback for",JSON.stringify(err));
                                });
                            } else {    
                                logger.info("successfully made amove");
                            }
                        });
                    }
                })
                if(time<=0){
                  position.gameOver = true
                }else{
                  position.gameOver = false
                }
                // Broadcast the move event to all connected clients
                io.emit(data.matchId, position);
            });
          });
        }
    }





    } else {
      // Token is invalid, handle accordingly (e.g., emit an error event)
      logger.error('Invalid token');
      socket.emit('error', 'Invalid token');
    }
  });

  socket.on('disconnect', () => {
    logger.info('User disconnected');
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  logger.info(`Server is running on http://localhost:${PORT}`);
});
