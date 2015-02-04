//shell.js - a shell-like library for JavaScript environments.
//Copyright 2011-2015 by Julius D'souza. Licensed under GPL 3.0.

/* TODOS
TODO: figure out how to do deep copy cleanly in node / get rid of silly jQuery use
TODO: AMD loading / 
*/

//var root = this;

var Shell = function() {
    this.path = '';     //this.path is of the form 'x.y.z'
    this._modes = { dev: false};
    this._isProduction = false;  //better safe than sorry...
    this._logs = {};
    this._processes = {};
    this._processCounter = 0;
    this._signals = {_kill: 1, _terminate: 2};
    if (typeof module !== 'undefined') {
        if (module.exports) {
            module.exports = this;
        }

        this._environment = root;
        this._modes.nodejs = true;  //assuming a nodejs environment
    } else if (root.window) {
        this._environment = window;
    }

    this.cd = function(objString) {
        var pathObjects = [];
        //cd('..') acts like cd ..
        //cd($string) switches to the object
        // -- local scoping followed by global scoping

        if (!objString) {
            this.path = ''; //move to the top
        } else if (objString === '..') {
            //move up the object chain: x.y.z -> x.y
            //tokenizes the path by '.' into an array,
            //pops the array and recreates the path string
            pathObjects = this.path.split('.');
            pathObjects.pop();
            if (pathObjects.length) {
                this.path = pathObjects.reduce(function(pathChain, pathLink) {
                    return pathChain.concat('.', pathLink);
                });
            } else {
                this.path = '';
            }
        } else if (this._reference([this.path, '.', objString].join('')) instanceof Object) {
            this.path = [this.path, '.', objString].join(''); //move to local object
        } else if (this._reference(objString) instanceof Object) {
            this.path = objString; //move to global object
        } else {
            this.log('dev','cd', 'No such object exists.');
        }
    };

    this.cp = function(origin, finish) {
        return this._objScope(finish, this._objScope(origin));
    };

    this._createParameterOptionRegex = function(singleParams, doubleParams) {
        //example usage: this._createParameterOptionRegex('[xy]','(--x-option|--y-option)')
        return RegExp(['((^|\\s)-[\\w]?', singleParams, '[\\w]?)|(', doubleParams, '(\\s|$))'].join('')); 
    };

    this._inferMethodName = function(method) {
        var name, strForm;
        if (!method instanceof Function) {
            this.log('dev', '_inferMethodName', 'Need a function.');
            return;
        }
        strForm = String(method);
        name = strForm.substring(9, strForm.indexOf('('));  //String(foo) gives 'function() <--func name here-->{ etc...'
        if (!name) {
            name = 'anonymous';
        }
        return name;
    };

    this.kill = function(processName, willFinishNow) {
        //NOTE - still needs work, obviously not production safe
        if (this._isProduction) {
            return;
        }
        var localProcess, processID, intervalRef, callable, finalCall, terminationCall,
            message = ['no', 'onPlaceholderMethod() for', 'process with the name or processID of', processName];
        if (!this._processes[processName]) {
            this.log('dev','kill', message.join(' '));
        }
        localProcess = this._processes[processName];

        if (!(localProcess instanceof Array)) {
            this.log('dev', 'kill', ['localProcess for', processName, 'is invalid.'].join(' '));
            return;
        }
        processID = localProcess[0];
        intervalRef = localProcess[1];
        callable = localProcess[2];

        finalCall = callable.onFinish && callable.onFinish instanceof Function;
        terminationCall = callable.onDestroyed && callable.onDestroyed instanceof Function;

        if (!willFinishNow) {
            if (!finalCall) {
                message[1] = 'onFinish() method for ';
                this.log('dev','kill', message);
            } else {
                callable.onFinish(localProcess);
                this._signals[processID] = this._signals._kill;
            }
        } else if (willFinishNow && terminationCall) {
            if (!finalCall) {
                message[1] = 'onDestroyed() method for ';
                this.log('dev','kill', message);
            } else {
                callable.onDestroyed(localProcess);
                this._signals[processID] = this._signals._terminate;
            }
            clearInterval(intervalRef);
            delete this._processes[processName];
            delete this._processes[processID];
        }
    };

    this.log = function(logType, name, message) {
        if (!logType || !this._modes[logType])
            return;
        var logTuple = [[name, '():\t'].join(''), message, new Date()];

        console.log(logTuple[0], logTuple[1]);
        if (this._logs.dev && (this._logs.dev instanceof Array)) {
            this._logs.dev.push(logTuple);
        }
    };

    this.ls = function(key, paramString) {
        //return array with keys of the current path object
        if (paramString && !this._validateParameterOptions(paramString)) {
            return [];
        }
        var lsMethod = this._createParameterOptionRegex('a', '--all').test(paramString) ? Object.getOwnPropertyNames : Object.keys,
            currentObj = this._objScope(key) || {},
            keyFilter = this._pathFilter(key);

        if (keyFilter && !this._objScope(key)) {
            return lsMethod(this._objScope(this.path)).filter(function(i) { return keyFilter.test(i)}).sort();
        } else {
            return lsMethod(currentObj);
        }
    };

    this.mkdir = function(newObjPath, protoObjPath) {
        //mkdir(newObjPath) makes an empty object
        //mkdir(newObjPath, protoObjPath) makes an object newObj with protoObj as the prototype
        var mapMethod = function(newEntry, index) {
                var newObj = newEntry.split('.').pop(),
                    context = this._newContext(newEntry),
                    isValidProtoArray = protoObjPath instanceof Array && newObjPath instanceof Array && (protoObjPath.length === newObjPath.length),
                    objCreated;

                if (!context) {
                    return;     //quit if no valid new object can be made
                }

                if (protoObjPath instanceof Array) {
                    if (!isValidProtoArray) {
                        return; //quit if newObj and protoObj array lengths mismatch
                    }                   
                    objCreated = Object.create(this._objScope(protoObjPath[index]));
                } else if (typeof protoObjPath === 'string' && this._objScope(protoObjPath)) {
                    objCreated = Object.create(this._objScope(protoObjPath));
                } else {
                    objCreated = {};
                }

                context[newObj] = objCreated;
            }.bind(this);
        return this._vectorMap(newObjPath, mapMethod);
    };

    this._newContext = function(pathString) {
        //ensure that the property to be made doesn't exist yet but has a valid path
        var parentPath = pathString.split('.'),
            pathEnd = parentPath.pop(),
            context;

        parentPath = parentPath.join('.');
        if (parentPath) {
            context = this._objScope(parentPath);
            if (context[pathEnd]) {
                this.log('dev','_newContext', ['Object already exists in ', pathString, '.'].join(''));
            }
            return context && !context[pathEnd] && context; //get the actual object reference
        } else {
            return this._reference(this.path);
        }
    };

    this._objScope = function(objString, newValue, deleteFlag) {
        //scoping for object and object properties
        if (!objString) {
            return this._reference();
        }
        var globalPathEnvironment = objString.split('.'),
            globalPathObject = globalPathEnvironment.pop(),
            localPathEnvironment = [this.path, objString].join('.').split('.'),
            localPathObject = localPathEnvironment.pop(),
            isLocalObj;

        globalPathEnvironment = this._reference(globalPathEnvironment.join('.'));
        localPathEnvironment = this._reference(localPathEnvironment.join('.'));
        isLocalObj = localPathEnvironment && (localPathEnvironment[localPathObject] || newValue);

        if (!isLocalObj && globalPathEnvironment instanceof Object) {
            //global scoping behaviour
            if (deleteFlag) {
                delete globalPathEnvironment[globalPathObject];
            } else if (newValue) {
                globalPathEnvironment[globalPathObject] = newValue;
            } else {
                return globalPathEnvironment[globalPathObject];
            }
        } else if (localPathEnvironment instanceof Object) {
            //local scoping behaviour
            if (deleteFlag) {
                delete localPathEnvironment[localPathObject];
            } else if (newValue !== undefined) {
                localPathEnvironment[localPathObject] = newValue;
            } else {
                return localPathEnvironment[localPathObject];
            }
        } else {
            this.log('dev','_objScope', ['Scoping failure for ', objString].join(''));
        }
    };

    this._pathFilter = function(filterString) {
        //checks for *'s and .'s for filtering cli-style
        if (!filterString) {
            this.log('dev','_pathFilter', 'No string to filter.')
            return;
        } else if (typeof filterString !== 'string') {
            this.log('dev','_pathFilter', 'Given value is not a string.')
            return;
        }
        var regexArray = [],
            filterRegex;
        for(var i = 0; filterString.length > i; ++i) {
            if (filterString[i] === '*') {
                regexArray.push('.');
                regexArray.push('*');
            } else if (filterString[i] === '.') {
                regexArray.push('.');
            } else {
                regexArray.push(filterString[i]);
            }
        }
        return RegExp(regexArray.join(''));
    };

    this._pipe = function(input, mapFunction) {
        //TODO finish _pipe, check yield support carefully
        var nodeVersion;
        if (this._modes.nodejs && this._environment['process']) {
            nodeVersion =  process.version
                            .substr(1)
                            .split('.')
                            .map(function(element) { return Number(element);});
            if (!(nodeVersion[0] >= 0 && nodeVersion[1] >= 11 && nodeVersion[2] > 2)) {
                //need at least 0.11.2 for v8 generators
                this.log('dev', '_pipe', ['Need v8 generators which are unsupported in node ', process.version, '. Exiting.'].join(''));
                return;
            }
        }
        if (this._isProduction) {
            return;
        }
    };

    this.pwd = function(resultIsString) {
        var result;
        if (resultIsString) {
            result = this.path ? this.path : 'this';
        } else {
            result = this.path ? this._objScope(this.path) : this;
        }

        return result;
    };

    this._reference = function(pathString) {
        //takes a path string and returns what it refers to if it exists
        var mapMethod = function(entry) {
            var pathArray, deepRef, outerArrayRef, multiArrayRef, currentContext,
                arrayRegex = /\[([^\]]+)\]/g,
                startRegex = /^(\w+)\[/;

            if (entry) {
                pathArray = entry.split('.');
                deepRef = this._environment;
                //if next token is an object, shift to it and repeat
                while ((pathArray.length) && (deepRef instanceof Object)) {
                    currentContext = pathArray.shift();
                    outerArrayRef = startRegex.exec(currentContext);

                    outerArrayRef = outerArrayRef && outerArrayRef[1];
                    multiArrayRef = (currentContext.match(arrayRegex) || []).map(function(i){ return i.slice(1, i.length - 1);});
                    deepRef = deepRef[outerArrayRef || currentContext];

                    if (outerArrayRef) {
                        while (multiArrayRef.length && deepRef && deepRef[multiArrayRef[0]]) {
                            deepRef = deepRef[multiArrayRef.shift()];
                        }
                    }
                }
                return deepRef;
            } else {
                return this._environment;
            }
        }.bind(this);
        return this._vectorMap(pathString, mapMethod);
    };

    this.rm = function(keyString) {
        var mapMethod = function(key) { this._objScope(key, null, true);}.bind(this);
        return this._vectorMap(keyString, mapMethod);
    };

    this.setMode = function(mode, value) {
        var optName;
        if (typeof mode !== 'string') {
            this.log('dev','setMode', 'Mode name needs to be a string.');
            return;
        }

        if (value !== Boolean(value)) {
            this.log('dev','setMode', 'Value must be either true or false.');
            return;
        } else if (this._modes[mode] !== Boolean(this._modes[mode])) {
            this.log('dev','setMode', 'No such mode.');
            return;
        }
        this._modes[mode] = value;
        if (!(this._logs[mode] instanceof Array) && value) {
            this._logs[mode] = [];
        }
        return true;
    };

    this.shell = function(callable, intervalTime, args, altName) {
        //NOTE - NOT PRODUCTION SAFE.
        //TODO tests
        if (this._isProduction) {
            return;
        }

        //if no function to call and time interval, stop
        if (!(callable instanceof Function) && (intervalTime instanceof Number) && (intervalTime > 0))
            return;
        //kick out non-string altnames & do not accept numbers as shorthand names
        if ((typeof altName !== 'string') || !Number.isNaN(Number(altName)))
            return;
        var procName = this._inferMethodName(callable),
            intervalRef = intervalTime ? setInterval(function(){ return callable.bind(this, args);}, intervalTime) : undefined,
            tuple = [this._processCounter, intervalRef, callable];

        if (intervalRef) {
            if (!this._processes[procName]) {
                this._processes[procName] = tuple;
            } else {
                this._processes[procName].push(tuple);
            }
            this._processes[this._processCounter] = tuple;    //overwrite by default for process IDs
            if (altName) {
                this._processes[altName] = tuple;
                if (this._processes[altName]) {
                    this.log('dev','shell', ['altName', altName, 'overwritten for process', this._processCounter].join(' '));
                }
            }
            return this._processCounter++;
        } else {
            return callable.call(this, args);
        }
    };

    this._validateParameterOptions = function(paramString) {
        //ensure that options are of form -[letters] or --word1-word2
        var isValid = /(((^|\s)-[\w]+|--[\w][\w-]+)(\s)?)+$/.test(paramString);
        if (!isValid) {
            this.log('dev','_validateParameterOptions', [paramString, 'is an invalid option.'].join(' '));
        }
        return isValid;
    };

    this._vectorMap = function(item, mapMethod) {
        var mapObj = {};
        if (item instanceof Array) {
            return item.map(mapMethod);
        } else if (item instanceof Object) {
            return Object.keys(item).map(function(key){
                mapObj[key] = mapMethod(item[key]);
            });
        } else {
            return mapMethod(item);
        }
    };
}

//export a module with the function if in node
if (!this['window']) {
    module.exports = Shell;
}
