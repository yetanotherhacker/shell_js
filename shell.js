//shell.js - a shell-like library for JavaScript environments.
//Copyright 2015 by Julius D'souza. Licensed under GPL 3.0.

var Shell = function() {
    this._path = '';     //dot-delimited string: i.e. of form 'x.y.z'
    this._state = { dev: false, production: false};
    this._logs = {};
    this._messages = {
        production: 'In a production environment. Exiting.'
    };
    this._process = {
        collection: {},
        counter: 0
    };
    this._signals = {kill: 1, terminate: 2};
    this.version = 0.81;
    if (typeof root === 'object' && typeof process === 'object') {
        this._environment = root;
        this._state.nodejs = {};  //assuming a nodejs environment
        this._state.nodejs.version =  process.version
                                    .substr(1)
                                    .split('.')
                                    .map(function(element) { return Number(element);});
    } else if (typeof window === 'object') {
        this._environment = window;
    }

    this.cd = function(objName) {
        var pathArray = [];

        if (!objName) {
            this._path = ''; //move to the top
        } else if (objName === '..') {
            //move up the object chain: x.y.z -> x.y
            //tokenizes the path by '.' into an array,
            //pops the array and recreates the path string
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
        // TODO: design question: long-form alts for unix-style properties e.g. 'user' for 'u'?
        if (this._state.production) {
            this.log('dev', 'chmod', this._messages.production);
            return;
        }
        if ((typeof chmodString !== 'string') || !(rightsObj instanceof Object)) {
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
            })
        }
    };

    this._chmodCheck = function(rightsObj, permission, userClass) {
        //virtual chmod property checks
        //NOTE: the range of {true, false, undefined} is intentional
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
            name = '0_anonymous';   //syntax hack; a valid function name can't start with a digit
        }
        return name;
    };

    this.kill = function(processName, willFinishNow) {
        //NOTE - still needs work, obviously not production safe
        if (this._state.production) {
            this.log('dev', 'chmod', this._messages.production);
            return;
        }
        var localProcess, processID, intervalRef, callable, finalCall, terminationCall,
            message = ['no', 'onPlaceholderMethod() for', 'process with the name or processID of', processName];
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

        if (!willFinishNow) {
            if (!finalCall) {
                message[1] = 'onFinish() method for ';
                this.log('dev','kill', message);
            } else {
                callable.onFinish(localProcess);
                this._signals[processID] = this._signals.kill;
            }
        } else if (willFinishNow && terminationCall) {
            if (!finalCall) {
                message[1] = 'onDestroyed() method for ';
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
            console.log('log(): Need a proper log type.');
            return;
        }

        if (!name || !message) {
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
            return lsMethod(currentObj);
        }
    };

    this.mkdir = function(newObjPath, protoObjPath) {
        //mkdir(newObjPath) makes an empty object
        //mkdir(newObjPath, protoObjPath) makes an object newObj with protoObj as the prototype
        var mapMethod = function(newEntry, index) {
            var newObj = newEntry.split('.').pop(),
                context = this._newContext(newEntry),
                isValidProtoArray = protoObjPath instanceof Array &&
                                    newObjPath instanceof Array &&
                                    (protoObjPath.length === newObjPath.length),
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
            localPathEnvironment = [this._path, objName].join('.').split('.'),
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
        if (this._state.production) {
            this.log('dev', 'chmod', this._messages.production);
            return;
        }
        //TODO finish _pipe, check yield support carefully
        var version = this.state.nodejs.version;
        if (!(version[0] >= 0 && version[1] >= 11 && version[2] > 2)) {
            //need at least 0.11.2 for v8 generators
            this.log('dev', '_pipe', ['Need v8 generators which are unsupported in node ', process.version, '. Exiting.'].join(''));
            return;
        }
    };

    this.pwd = function(resultIsString) {
        var result;
        if (resultIsString) {
            result = this._path ? this._path : 'this';
        } else {
            result = this._path ? this._objScope(this._path) : this;
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
        } else if (this._state[mode] !== Boolean(this._state[mode])) {
            this.log('dev','setMode', 'No such mode.');
            return;
        }
        this._state[mode] = value;
        if (!(this._logs[mode] instanceof Array) && value) {
            this._logs[mode] = [];
        }
        return true;
    };

    this.shell = function(callable, intervalTime, args, altName) {
        //NOTE - NOT PRODUCTION SAFE.
        //TODO tests
        if (this._state.production) {
            this.log('dev', 'chmod', this._messages.production);
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
            tuple = [this._process.counter, intervalRef, callable];

        if (intervalRef) {
            if (!this._process.collection[procName]) {
                this._process.collection[procName] = tuple;
            } else {
                this._process.collection[procName].push(tuple);
            }
            this._process.collection[this._process.counter] = tuple;    //overwrite by default for process IDs
            if (altName) {
                this._process.collection[altName] = tuple;
                if (this._process.collection[altName]) {
                    this.log('dev','shell', ['altName', altName, 'overwritten for process', this._process.counter].join(' '));
                }
            }
            return this._process.counter++;
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
if (typeof define == 'function' && define.amd) {
    define('shelljs', [], function() {
        return Shell;
    });
}