(function() {

  self.JSREPLEngine = (function() {

    function JSREPLEngine(input, output, result, error, sandbox, ready) {
      this.result = result;
      this.error = error;
      this.sandbox = sandbox;
      this.inspect = this.sandbox.console.inspect;
      this.sandbox.__eval = this.sandbox["eval"];
      this.Babel = this.sandbox.Babel;
      ready();
    }

    JSREPLEngine.prototype.Eval = function(command) {
      var result, source;
      try {
        source = this._Compile(command);
      } catch (e) {
        this.error(e);
        return;
      }
      try {
        result = this.sandbox.__eval(source);
        return this.result(result === void 0 ? '' : this.inspect(result));
      } catch (e) {
        return this.error(e);
      }
    };

    JSREPLEngine.prototype.GetNextLineIndent = function(command) {
      var last_line;
      try {
        this._Compile(command);
        last_line = command.split('\n').slice(-1)[0];
        if (/^\s+/.test(last_line)) {
          return 0;
        } else {
          return false;
        }
      } catch (e) {
        if (/[\[\{\(]$/.test(command)) {
          return 1;
        } else {
          return 0;
        }
      }
    };

    JSREPLEngine.prototype._Compile = function(command) {
      return this.Babel.transform(command, {
        presets: ['es2015']
      }).code;
    };

    return JSREPLEngine;

  })();

}).call(this);
