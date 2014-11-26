//shell.js - a library to treat a JavaScript environment like a unix shell.
//Copyright 2011-2014 by Julius D'souza. Licensed under GPL 3.0.

/* TODOS
TODO: figure out how to do deep copy cleanly in node / get rid of silly jQuery use
TODO: make piping work
*/

Shell = function() {
    this.path = '';     //this.path is of the form 'x.y.z'
    this._devMode = false;
    this._logs = {};
    this._processes = {};
    this._processCounter = 0;
    this._signals = {_kill: 1};
    if (this['window']) {
        this._environment = window;
    } else {
        this._environment = GLOBAL; //NOTE: this['GLOBAL'] will NOT work in a module
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
            this._devLog('cd', 'No such object exists.');
        }
    };

    this.cp = function(origin, finish) {
        return this._objScope(finish, this._objScope(origin));
    };

    this._handleParameterOptions = function(singleParams, doubleParams) {
        //example usage: this._handleParameterOptions('[xy]','(--x-option|--y-option)')
        return RegExp(['((^|\\s)-[\\w]?', singleParams, '[\\w]?)|(', doubleParams, '(\\s|$))'].join('')); 
    };

    this._devLog = function(name, message) {
        //TODO: infer name from function?
        if (!this._devMode)
            return;
        var logTuple = [[name, '():\t'].join(''), message];

        console.log(logTuple[0], logTuple[1]);
        if (this._logs.dev && (this._logs.dev instanceof Array)) {
            this._logs.dev.push(logTuple);
        }
    };

    this.kill = function(processName, willFinishNow) {
        //NOTE - NOT PRODUCTION SAFE
        var localProcess, id, intervalRef, callable, finalCall, terminationCall,
            message = ['no', '', ' process with the name or ID of ', processName];
        if (!this._processes[processName]) {
            this._devLog('kill', message.join(''));
        }
        localProcess = this._processes[processName],
        finalCall = callable.onFinish && callable.onFinish instanceof Function,
        terminationCall = callable.onDestroyed && callable.onDestroyed instanceof Function;

        id = localProcess[0];
        intervalRef = localProcess[1];
        callable = localProcess[2];

        if (!willFinishNow) {
            if (!finalCall) {
                message[1] = 'onFinish() method for ';
                this._devLog('kill', message);
            } else {
                callable.onFinish(localProcess);
                this._signals[id] = this._signals.kill;
            }
        } else if (willFinishNow && terminationCall) {
            if (!finalCall) {
                message[1] = 'onDestroyed() method for ';
                this._devLog('kill', message);
            } else {
                callable.onDestroyed(localProcess);
            }
            clearInterval(intervalRef);
            delete this._processes[processName];
            delete this._processes[id];
        }
    }

    this.ls = function(key, paramString) {
        //declare contents of current path's object
        if (paramString && !this._validateParameterOptions(paramString)) {
            return [];
        }
        var lsMethod = this._handleParameterOptions('a', '--all').test(paramString) ? Object.getOwnPropertyNames : Object.keys,
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
                this._devLog('_newContext', ['Object already exists in ', pathString, '.'].join(''));
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
            this._devLog('_objScope', ['Scoping failure for ', objString].join(''));
        }
    };

    this._pathFilter = function(filterString) {
        //checks for *'s and .'s for filtering cli-style
        if (!filterString) {
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

    this.prettyPrint = function(dataMatrix) {
        //NOTE - NOT PRODUCTION SAFE
        var rowLength = dataMatrix.length,
            columnLength = dataMatrix[0].length,
            tableSizes = Array.apply(null, Array(rowLength)),
            isConsistent;

        isConsistent = dataMatrix.every(function(rowElement, rowIndex) {
            rowElement.forEach(function(columnElement, columnIndex) {
                tableSizes[columnIndex] = Math.max(tableSizes[columnIndex] || 0, String(columnElement).length);
            });
            return rowElement.length === columnLength;
        });
        if (!isConsistent) {
            //kill if column lengths are inconsistent
            this._devLog('prettyPrint', 'Inconsistent column lengths.');
            return;
        }

        //TODO actual pretty printing.
        return tableSizes;
    };

    this.pwd = function(resultIsString) {
        var result;
        if (resultIsString) {
            result = this.path ? this.path: 'this';
        } else {
            result = this.path ? this._objScope(this.path) : this;
        }

        return result;
    };

    this._reference = function(path) {
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
                        while (outerArrayRef && multiArrayRef.length && deepRef && deepRef[multiArrayRef[0]]) {
                            deepRef = deepRef[multiArrayRef.shift()];
                        }
                    }
                    return deepRef;
                } else {
                    return this._environment;
                }
            }.bind(this);
        return this._vectorMap(path, mapMethod);
    };

    this.rm = function(keyString) {
        var mapMethod = function(key) { this._objScope(key, null, true);}.bind(this);
        return this._vectorMap(keyString, mapMethod);
    };

    this.setDevMode = function() {
        this._devMode = true;
        this._logs.dev = [];
    };

    this.shell = function(callable, intervalTime, args, altName) {
        //NOTE - NOT PRODUCTION SAFE.
        //TODO tests

        //if no function to call and time interval, stop
        if (!(callable instanceof Function) && (intervalTime instanceof Number) && (intervalTime > 0))
            return;
        //not accepting numbers as shorthand names
        if (altName && !Number.isNaN(Number(altName)))
            return;
        var strForm = String(callable),
            intervalRef = intervalTime ? setInterval(function(){ return callable.bind(this, args);}, intervalTime) : undefined,
            procName = strForm.substring(9, strForm.indexOf('(')),  //String(foo) gives 'function() <--func name here-->{ etc...'
            tuple = [this._processCounter, intervalRef, callable];

        if (intervalRef) {
            if (!procName) {
                //anonymous functions still should be recorded if they're being called repeatedly
                procName = 'anonymous';
            }
            if (!this._processes[procName]) {
                this._processes[procName] = tuple;
            } else {
                this._processes[procName].push(tuple);
            }
            this._processes[this._processCounter] = tuple;    //overwrite by default for process IDs
            if (altName) {
                this._processes[altName] = tuple;
                if (this._processes[altName]) {
                    this._devLog('shell', ['altName', altName, 'overwritten for process', this._processCounter].join(''));
                }
            }
            return this._processCounter++;
        } else {
            return callable.call(this, args);
        }
    };

    this.top = function(resultIsString, topOptions) {
        //TODO: process monitoring
        //TODO: htop-style options
        if (resultIsString) {
            return; //TODO: stringify
        } else {
            return this._processes;
        }
    };

    this._validateParameterOptions = function(paramString) {
        //ensure that options are of form -[letters] or --word1-word2
        var isValid = /(((^|\s)-[\w]+|--[\w][\w-]+)(\s)?)+$/.test(paramString);
        if (!isValid) {
            this._devLog('_validateParameterOptions', [paramString, 'is an invalid option.'].join(''));
        }
        return isValid;
    };

    this._vectorMap = function(item, mapMethod) {
        var mapObj = {};
        if (item instanceof Array) {
            return item.map(mapMethod);
        } else if (item instanceof Object) {
            Object.keys(item).map(function(key){
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
