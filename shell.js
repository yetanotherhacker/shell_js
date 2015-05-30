//shell.js - a shell-like library for JavaScript environments.
//Copyright 2015 by Julius D'souza. Licensed under GPL 3.0.

var Shell = function() {
    this._logs = {};
    this._messages = {
        notCollection: 'Need an array or object.',
        production: 'In a production environment. Exiting.'
    };
    this._path = '';
    this._process = {
        collection: {},
        counter: 0
    };
    this._signals = {kill: 1, terminate: 2};
    this._state = { dev: true, production: false};
    this._validTypes = {
        isIterable: function(element) {
            //TODO: generalize safely to iterable functions
            return (element instanceof Object);
        }
    }
    this.version = 0.82;
    if (typeof root === 'object' && typeof process === 'object') {
        //assuming a nodejs environment
        this._environment = root;
        this._state.nodejs = {};
        this._state.nodejs.version = process.version
                                    .substr(1)
                                    .split('.')
                                    .map(function(element) { return Number(element);});
    } else if (typeof window === 'object') {
        //assuming a browser environment
        this._environment = window;
    }

    this.cd = function(objName) {
        var pathArray = [];

        if (!objName) {
            this._path = ''; //move to the top
        } else if (objName === '..') {
            //move up the object chain: x.y.z -> x.y
            pathArray = this._path.split('.');
            pathArray.pop();
            if (pathArray.length) {
                this._path = pathArray.reduce(function(pathChain, pathLink) {
                    return pathChain.concat('.', pathLink);
                });
            } else {
                this._path = '';
            }
        } else if (this._reference([this._path, '.', objName].join('')) instanceof Object) {
            this._path = [this._path, '.', objName].join(''); //move to local object
        } else if (this._reference(objName) instanceof Object) {
            this._path = objName; //move to global object
        } else {
            this.log('dev','cd', 'No such object exists.');
        }
    };

    this.chmod = function(rightsObj, chmodString) {
        //TODO: check versus chmod specs, get working correctly
        //TODO: design question: long-form alts for unix-style properties e.g. 'user' for 'u'?
        if (this._state.production) {
            this.log('dev', 'chmod', this._messages.production);
            return;
        } else if ((typeof chmodString !== 'string') || !(rightsObj instanceof Object)) {
            this.log('dev', 'chmod', 'Invalid type for parameters.');
            return;
        }
        var modifierArray = chmodString.match(/^([+-])([rwx]+)$/),
            ownersArray = ['g', 'o', 'u'],
            numericArray = chmodString.match(/^([0-7]{3})$/),
            defaultRights = {r: true, w: true, x: true},
            matchArray = [],
            isPlus;

        if (!numericArray && !modifierArray) {
            this.log('dev', 'chmod', 'Invalid permissions string.');
            return;
        }

        if (!rightsObj._chmod) {
            //prefill chmod rights
            rightsObj._chmod = {};
            ownersArray.forEach(function(userClass) {
                rightsObj._chmod[userClass] = {};
                Object.keys(defaultRights).forEach(function(rightsKey) {
                    rightsObj._chmod[userClass][rightsKey] = false;
                });
            });
        }

        if (modifierArray) {
            //may be esoteric, check verses specs
            matchArray = modifierArray[2];
            isPlus = modifierArray[1] === '+';
            matchArray.split('').forEach(function(rightsKey) {
                rightsObj._chmod.u[rightsKey] = isPlus;
            });
        } else if (numericArray) {
            matchArray = chmodString.split('');
            ownersArray.forEach(function(owner, index) {
                var octal = Number(matchArray[index]),
                    isExecute = octal % 2,
                    isWrite = Math.floor(octal / 2) % 2,
                    isRead = Math.floor(octal / 4) % 2;

                rightsObj._chmod[owner] = {
                    r: isRead,
                    w: isWrite,
                    x: isExecute
                };
            });
        }
    };

    this._chmodCheck = function(rightsObj, permission, userClass) {
        //virtual chmod property checks
        //NOTE: the return range of {true, false, undefined} is intentional
        userClass = userClass || 'u';
        if (this._state.production) {
            this.log('dev', 'chmod', this._messages.production);
            return;
        } else if (!rightsObj || !(rightsObj instanceof Object)) {
            this.log('dev', 'chmod', 'Not a valid object.');
            return;
        } else if (userClass && (!(typeof userClass === 'string') || /^[rwx]$/.test(userClass))) {
            this.log('dev', 'chmod', 'Invalid user class.');
            return;
        } else if (!permission || !((typeof permission === 'string') || /^[gou]$/.test(permission))) {
            this.log('dev', 'chmod', 'Invalid permission type.');
            return;
        } else if (!rightsObj._chmod) {
            this.log('dev', 'chmod', 'Object does not currently support virtual chmod. Please define its rights.');
            return;
        } else if (rightsObj._chmod[userClass] && rightsObj._chmod[userClass][permission]) {
            return true;
        }

        return false;
    };

    this.cp = function(origin, destination) {
        return this._objScope(destination, this._objScope(origin));
    };

    this._createParameterOptionRegex = function(singleParams, doubleParams) {
        //example usage: this._createParameterOptionRegex('[xy]','(--x-option|--y-option)')
        return RegExp(['((^|\\s)-[\\w]?', singleParams, '[\\w]?)|(', doubleParams, '(\\s|$))'].join('')); 
    };

    this._inferMethodName = function(method, generateFlag) {
        var methodName, strForm;
        if (!method instanceof Function) {
            this.log('dev', '_inferMethodName', 'Need a function.');
            return;
        }

        strForm = String(method);
        methodName = strForm.substring(9, strForm.indexOf('('));  //grab name from string form of function
        if (!methodName && generateFlag) {
            methodName = '0_anonymous';   //syntax hack for record generation; a valid function name can't start with a digit
        }
        return methodName;
    };

    this.kill = function(processName, finishFlag) {
        //NOTE - currently in stasis, obviously not production safe
        if (this._state.production) {
            this.log('dev', 'chmod', this._messages.production);
            return;
        }
        var localProcess, processID, intervalRef, callable, finalCall, terminationCall,
            message = ['no', 'onPlaceholder()', ' method for', 'process with the name or processID of', processName];
        if (!this._process.collection[processName]) {
            this.log('dev','kill', message.join(' '));
        }
        localProcess = this._process.collection[processName];

        if (!(localProcess instanceof Array)) {
            this.log('dev', 'kill', ['localProcess for', processName, 'is invalid.'].join(' '));
            return;
        }
        processID = localProcess[0];
        intervalRef = localProcess[1];
        callable = localProcess[2];

        finalCall = callable.onFinish && callable.onFinish instanceof Function;
        terminationCall = callable.onDestroyed && callable.onDestroyed instanceof Function;

        if (!finishFlag) {
            if (!finalCall) {
                message[1] = 'onFinish()';
                this.log('dev','kill', message);
            } else {
                callable.onFinish(localProcess);
                this._signals[processID] = this._signals.kill;
            }
        } else if (finishFlag && terminationCall) {
            if (!finalCall) {
                message[1] = 'onDestroyed()';
                this.log('dev','kill', message);
            } else {
                callable.onDestroyed(localProcess);
                this._signals[processID] = this._signals.terminate;
            }
            clearInterval(intervalRef);
            delete this._process.collection[processName];
            delete this._process.collection[processID];
        }
    };

    this.log = function(logType, name, message) {
        if (!logType || !this._state[logType]) {
            console.log('log(): Need a proper type.');
            return;
        } else if (!(name && message)) {
            return this._logs[logType];
        }

        var logTuple = [[name, '():\t'].join(''), message, new Date()];

        console.log(logTuple[0], logTuple[1]);
        if (this._logs[logType] && (this._logs[logType] instanceof Array)) {
            this._logs[logType].push(logTuple);
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
            return lsMethod(this._objScope(this._path)).filter(function(i) { return keyFilter.test(i)}).sort();
        } else {
            return lsMethod(currentObj).sort();
        }
    };

    this.mkdir = function(newObjPath, protoObjPath) {
        //mkdir(newObjPath) creates an empty object
        //mkdir(newObjPath, protoObjPath) creates an object newObj with protoObj as the prototype
        var mapMethod = function(newEntry, index) {
            var newObjKey = newEntry.split('.').pop(),
                context = this._newContext(newEntry),
                isValidProtoArray = protoObjPath instanceof Array &&
                                    newObjPath instanceof Array &&
                                    (protoObjPath.length === newObjPath.length),
                objCreated;

            if (!context) {
                this.log('dev', 'mkdir', 'Cannot make a valid object with given path.');
                return;     //quit if no valid new object can be made
            } else if (protoObjPath instanceof Array) {
                if (!isValidProtoArray) {
                    this.log('dev', 'mkdir', 'Given array lengths need to match.');
                    return; //quit if newObj and protoObj array lengths mismatch
                }                   
                objCreated = Object.create(this._objScope(protoObjPath[index]));
            } else if (typeof protoObjPath === 'string' && this._objScope(protoObjPath)) {
                objCreated = Object.create(this._objScope(protoObjPath));
            } else {
                objCreated = {};
            }

            context[newObjKey] = objCreated;
        }.bind(this);
        return this._vectorMap(newObjPath, mapMethod);
    };

    this._newContext = function(pathString) {
        //ensure that the property to be made doesn't exist yet but has a valid path
        var pathArray = pathString.split('.'),
            pathEnd = pathArray.pop(),
            context;

        pathArray = pathArray.join('.');
        if (pathArray) {
            context = this._objScope(pathArray);
            if (context[pathEnd]) {
                this.log('dev','_newContext', ['Object already exists in ', pathString, '.'].join(''));
                return;
            }
            return context;
        } else {
            return this._reference(this._path);
        }
    };

    this._objScope = function(objName, newValue, deleteFlag) {
        //scoping for object and object properties
        if (!objName) {
            return this._reference();
        }
        var globalPathEnvironment = objName.split('.'),
            globalPathObject = globalPathEnvironment.pop(),
            localPathEnvironment = [this._path, objName].join('.').split('.'),  //lazy string concatenate
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
            this.log('dev','_objScope', ['Scoping failure for ', objName].join(''));
        }
    };

    this._pathFilter = function(filterString) {
        //checks for *'s and .'s for filtering cli-style
        if (typeof filterString !== 'string') {
            this.log('dev','_pathFilter', ['Given value is not a string: ', filterString].join(''));
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

    this._pipe = function(iterable, mapFunction) {
        //TODO finish _pipe, check yield support carefully
        var version = this.state.nodejs.version;
        if (this._state.production) {
            this.log('dev', 'chmod', this._messages.production);
            return;
        } else if (!(version[0] >= 0 && version[1] >= 11 && version[2] > 2)) {
            //need at least 0.11.2 for v8 generators
            this.log('dev', '_pipe', ['Need v8 generators which are unsupported in node ', process.version, '. Exiting.'].join(''));
            return;
        } else if (!this._validTypes.isIterable(iterable)) {
            this.log('dev', 'chmod', this._messages.isIterable);
        }
    };

    this.pwd = function(returnStringFlag) {
        var result;
        if (returnStringFlag) {
            result = this._path ? this._path : 'this';
        } else {
            result = this._path ? this._objScope(this._path) : this;
        }

        return result;
    };

    this._reference = function(pathString) {
        //find and return property of named path property if possible
        var mapMethod = function(entry) {
            var arrayRegex = /\[([^\]]+)\]/g,
                startRegex = /^(\w+)\[/,
                currentContext, deepRef, headNode, multiArrayRef, outerArrayRef, pathArray;

            if (entry) {
                pathArray = entry.split('.');
                deepRef = this._environment;
                //if next token is an object, shift to it and repeat
                //handle arrays sufficiently
                while ((pathArray.length) && (deepRef instanceof Object)) {
                    currentContext = pathArray.shift();
                    outerArrayRef = startRegex.exec(currentContext);

                    outerArrayRef = outerArrayRef && outerArrayRef[1];  //regex group capture of inner array
                    multiArrayRef = (currentContext.match(arrayRegex) || []).map(function(i){ return i.slice(1, i.length - 1);});
                    deepRef = deepRef[outerArrayRef || currentContext];

                    if (!outerArrayRef) {
                        continue;
                    }
                    while (multiArrayRef.length && deepRef && deepRef[multiArrayRef[0]]) {
                        deepRef = deepRef[multiArrayRef.shift()];
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
        if (typeof mode !== 'string') {
            this.log('dev','setMode', 'Mode name needs to be a string.');
            return;
        } else if (value !== Boolean(value)) {
            this.log('dev','setMode', 'Value must be either true or false.');
            return;
        } else if (this._state[mode] !== Boolean(this._state[mode])) {
            this.log('dev','setMode', 'No such mode.');
            return;
        }
        this._state[mode] = value;
        if (!(this._logs[mode] instanceof Array) && value) {
            this._logs[mode] = [];
        }
        return value;
    };

    this.shell = function(callable, intervalTime, callParameters, altName) {
        //NOTE - currently in stasis, not production safe
        //TODO tests
        if (this._state.production) {
            this.log('dev', 'chmod', this._messages.production);
            return;
        }

        if (!(callable instanceof Function) && (intervalTime instanceof Number) && (intervalTime > 0)) {
            //exit if no function to call or valid time interval
            return;
        } else if ((typeof altName !== 'string') || !Number.isNaN(Number(altName))) {
            //kick out non-string altnames
            //do not accept numbers as shorthand names since they override counter-generated identifiers
            return;
        }
        var procName = this._inferMethodName(callable, true),
            intervalRef = intervalTime ? setInterval(function(){ return callable.bind(this, callParameters);}, intervalTime) : undefined,
            tuple = [this._process.counter, intervalRef, callable];

        if (!intervalRef) {
            return callable.call(this, args);
        }
        this._process.collection[procName] = this._process.collection[procName] || [];
        this._process.collection[procName].push(tuple);
        this._process.collection[this._process.counter] = tuple;    //overwrite by default for process IDs
        if (altName) {
            this._process.collection[altName] = tuple;
            if (this._process.collection[altName]) {
                this.log('dev','shell', ['altName', altName, 'overwritten for process', this._process.counter].join(' '));
            }
        }
        return this._process.counter++;
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
            return Object.keys(item).forEach(function(key){
                mapObj[key] = mapMethod(item[key]);
            });
        } else {
            return mapMethod(item);
        }
    };
}

//export a module with the function if in a node-like environment
if (typeof module === 'object' && module.exports) {
    module.exports = Shell;
}

//amd registration
if (typeof define === 'function' && define.amd) {
    define('shelljs', [], function() {
        return Shell;
    });
}