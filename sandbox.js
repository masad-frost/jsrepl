(function (global) {
  // Window is self in worker. Self is window in iframe.
  // Try for Firefox, which doesn't have a setter for these properties
  try {
    global.window = global.window || global;
  } catch (e) { }
  try {
    global.self = global.self || global; 
  } catch (e) { }
  
  
  var Sandboss;
  
  // Messaging.
  var msg_handler = function (e) {
    var message = JSON.parse(e.data),
        current = Sandboss,
        parts = message['type'].split('.');
    
    // Route message.
    for (var i = 0; i < parts.length; i++) {
      current = current[parts[i]];
    }
    
    current(message.data)
  };
  global.addEventListener('message', msg_handler, false);
  
  // Dummy console for some scripts would think there is one.
  (function () {
    var noop = function () {};
    var methods = ['debug', 'error', 'info', 'log',
                  'warn', 'dir', 'dirxml', 'trace',
                  'assert', 'count', 'markTimeline', 
                  'profile', 'profileEnd', 'time', 
                  'timeEnd', 'timeStamp', 'group', 
                  'groupCollapsed', 'groupEnd'];

    if (typeof console === 'undefined') {
      global.console = {};
    }

    for (var i = 0; i < methods.length; i++) {
      if (typeof global.console[methods[i]] !== 'function') {
        try{
          global.console[methods[i]] = noop;
        } catch (e) {}
      }
    }
  })();  
  
  
  // Sandbox controller.
  Sandboss = {
    outTimeout: 0,
    output_buffer: [],
    OUT_EVERY_MS: 50,
    syncTimeout: Infinity,
    isFrame : typeof document !== 'undefined',
    // Responsible for posting messages.
    post: function (msg) {
      var msgStr = JSON.stringify(msg);
      if (this.isFrame) {
        // Window communication require additional origin argument.
        window.parent.postMessage(msgStr, '*');
      } else {
        self.postMessage(msgStr);
      }
    },
    // Import an array of scripts.
    importScripts: function (scriptsArr) {
      var reqs = [],
          totalSize = 0,
          lastLoadedTable = [],
          totalUpdated = [],
          totalLoaded = 0,
          that = this,
          XHR = XMLHttpRequest || ActiveXObject('Microsoft.XMLHTTP');

      var updateSize = function (req) {
        if (totalUpdated.indexOf(req) === -1){
          totalUpdated.push(req);
          totalSize += parseInt(req.getResponseHeader('X-Raw-Length'), 10);
        }
      };

      var updateProgressCreator = function (index) {
        return function (e) {
          var loaded = e.loaded || e.position,
              lastLoaded = lastLoadedTable[index] || 0;

          lastLoadedTable[index] = loaded;
          totalLoaded += loaded - lastLoaded;
          var percentageDone = (totalLoaded / totalSize) * 100;
          if (totalUpdated.length === scriptsArr.length) {
           that.progress(percentageDone); 
          }
        };
      };

      var finished = scriptsArr.length;
      var finish = function (e) {
        var i;
        if (finished === 0) {
          for (i = 0; i < reqs.length; i++) {
            (self.execScript || function(data) {
            				self['eval'].call(self, data);
            })(reqs[i].responseText);
          }
          that.engine = new self.JSREPLEngine(that.input, that.out, that.result, that.err, self, that.ready);
          that.bindAll(Sandboss.engine);
          that.hide('JSREPLEngine');
        }
      };
      for (var i = 0; i < scriptsArr.length; i++){
        (function (i) {
          reqs[i] = new XHR();
          if (reqs[i].addEventListener) {
            reqs[i].addEventListener('progress', updateProgressCreator(i), false);
          }
          reqs[i].onprogress = updateProgressCreator(i);
          reqs[i].onreadystatechange = function () {
            if (reqs[i].readyState === 2) {
              updateSize(reqs[i]);
            } else if (reqs[i].readyState === 4) {
              finished--;
              finish();
            }
          };
          reqs[i].open('GET', scriptsArr[i], true);
          reqs[i].send(null);
        })(i);
      }
    },
    // Outbound output.
    out: function (text) {
      var that = this;
      this.output_buffer.push(text);
      if (this.outTimeout === 0) {
        this.outTimeout = setTimeout(this.flush, this.OUT_EVERY_MS);
        this.syncTimeout = Date.now();
      } else if (Date.now() - this.syncTimeout > this.OUT_EVERY_MS) {
        clearTimeout(this.outTimeout);
        this.flush();
      }
    },

    flush: function () {
      if (!this.output_buffer.length) return;
      var message = {
        type: 'output',
        data: this.output_buffer.join('')
      };
      this.post(message);
      this.outTimeout = 0;
      this.output_buffer = [];
    },
    // Outbound errors.
    err: function (e) {
      var message = {
        type: 'error',
        data: e.toString()
      };
      this.flush();
      this.post(message);
    },
    // Outbound input.
    input: function (callback) {
      // Incoming input would call "Sandboss.input.write", hence its our continuation callback.
      this.input.write = callback;
      var message = {
        type: 'input'
      };
      this.flush();
      this.post(message);
    },
    result: function (data) {
      var message = {
        type: 'result',
        data: data
      };
      this.flush();
      this.post(message);
    },
    // Outbound language ready function.
    ready: function (data) {
      var message = {
        type: 'ready'
      };
      this.post(message);
    },
    // Inbound/Outbound getNextLineIndent.
    // Gets the nextline indent and sends it in an 'indent' message.
    getNextLineIndent: function (data) {
      // Get line indent
      var indent = this.engine.GetNextLineIndent(data);
      var message = {
        type: 'indent',
        data: indent
      };
      this.post(message);
    },
    progress: function (data) {
      var message = {
        type: 'progress',
        data: data
      };
      this.post(message);
    },
    dbInput: function () {
      var message = {
        type: 'db_input'
      };
      this.flush();
      this.post(message);
    },
    serverInput: function () {
      var message = {
        type: 'server_input'
      };
      this.flush();
      this.post(message);
    },
    // Bind all methods to its owner object.
    bindAll: function (obj) {
      for (var method in obj) {
        (function (method) {
          var fn = obj[method];
          if (typeof fn == "function") {
            obj[method] = function () {
              var args = [].slice.call(arguments);
              return fn.apply(obj, args);
            };
          }
        })(method);
      }
    },
    // Try to hide and secure stuff.
    hide: function (prop) {
      try {
        Object.defineProperty(global, prop, {
          writable: false,
          enumerable: false,
          configurable: false,
          value: global[prop]
        }); 
      } catch (e) {}
    },

    set_input_server: function (settings) {
      var baseUrl = settings.url || '/emscripten/input/';
      function nextUrl() {
        // Note: we increment the input_id after each request to avoid race
        // conditions on the server. Keep this code in sync with repl.coffee
        return baseUrl + settings.input_id++;
      }
      this.input_server = {
        nextUrl: nextUrl,
        cors: settings.cors || false
      };
    }
  };
  
  // Bind all the sand minions to the SANDBOSS!! MWAHAHAHA
  Sandboss.bindAll(Sandboss);
  global.Sandboss = Sandboss;
  Sandboss.hide('Sandboss');
  
  var createRequest = function (method, url, isCors){
    var xhr = new XMLHttpRequest();
    if (isCors) {
      if ("withCredentials" in xhr) {
        xhr.open(method, url, false);
      } else if (typeof XDomainRequest != "undefined"){
        xhr = new XDomainRequest();
        xhr.open(method, url);
      } else {
        throw new Error('Your browser doesn\' support CORS');
      }
    } else {
      xhr.open(method, url, false);
    }
    return xhr;
  }
})(this);
