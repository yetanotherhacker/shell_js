//shell.js - a library to treat a JavaScript environment like a unix shell.
//Copyright 2011-2014 by Julius D'souza. Licensed under GPL 3.0.

/* TODOS
TODO: figure out how to do deep copy cleanly in node / get rid of silly jQuery use
TODO: make piping work
*/
Shell = function(){
    this.path = '';
    this._devMode = false;
    this._processes = {};
    this._counter = 0;
    //this.path is of the form 'x.y.z'

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
        } else if (typeof(this._reference([this.path, '.', objString].join(''))) === 'object') {
            this.path = [this.path, '.', objString].join(''); //move to local object
        } else if (typeof(this._reference(objString)) === 'object') {
            this.path = objString; //move to global object
        } else if (this._devMode) {
                console.log('No such object exists.');
        }
    };

    this.cp = function(origin, finish) {
        return this._objScope(finish, this._objScope(origin));
    };

    this._handleOption = function(singleParams, doubleParams) {
        //example usage: this._handleOption('[xy]','(--x-option|--y-option)')
        return RegExp(['((^|\\s)-[\\w]?', singleParams, '[\\w]?)|(', doubleParams, '(\\s|$))'].join('')); 
    };

    this.ls = function(key, paramString) {
        //declare contents of current path's object
        if (paramString && !this._validateOptions(paramString)) {
            return [];
        }
        var lsMethod = this._handleOption('a', '--all').test(paramString) ? Object.getOwnPropertyNames : Object.keys,
            currentObj = this._objScope(key) || {},
            keyFilter = this._pathFilter(key);

        if (keyFilter && !this._objScope(key)) {
            return lsMethod(this._objScope(this.path)).filter(function(i) { return keyFilter.test(i)}).sort();
        } else {
            return lsMethod(currentObj);
        }
    };

    this.mkdir = function(newObjPath, protoObjPath) {
        //TODO: figure out overwriting options / what to do if existing entry is not an object
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
        //ensure that the property to be made doesn't exist yet but is valid
        var parentPath = pathString.split('.'),
            pathEnd = parentPath.pop(),
            context;

        parentPath = parentPath.join('.');
        if (parentPath) {
            context = this._objScope(parentPath);
            if (context[pathEnd] && this._devMode) {
                console.log("Object already exists!");
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

        if (!isLocalObj && typeof(globalPathEnvironment) === 'object') {
            //global scoping behaviour
            if (deleteFlag) {
                delete globalPathEnvironment[globalPathObject];
            } else if (newValue) {
                globalPathEnvironment[globalPathObject] = newValue;
            } else {
                return globalPathEnvironment[globalPathObject];
            }
        } else if (typeof(localPathEnvironment) === 'object') {
            //local scoping behaviour
            if (deleteFlag) {
                delete localPathEnvironment[localPathObject];
            } else if (newValue !== undefined) {
                localPathEnvironment[localPathObject] = newValue;
            } else {
                return localPathEnvironment[localPathObject];
            }
        } else if(this._devMode) {
            console.log('Scoping failure for', objString);
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

    this.pwd = function(resultIsString) {
        var result;
        if (resultIsString) {
            result = !this.path ? 'this' : this.path;
        } else {
            result = !this.path ? this : this._objScope(this.path);
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
                    deepRef = this.environment;
                //if next token is an object, shift to it and repeat
                    while ((pathArray.length) && (typeof(deepRef) === 'object')) {
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
                    return this.environment;
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
    };

    this.shell = function(callable, intervalTime, args, altName) {
        //TODO finish this function
        var strForm = String(callable),
            intervalRef = intervalTime ? undefined : setInterval(callable.call(null, args), intervalTime),
            procName = strForm.substring(9, strForm.indexOf('('));  //String(foo) gives 'function() <--func name here-->{ etc...'

        if (intervalRef) {
            if (!procName) {
                this._processes[procName] = [this._counter, intervalRef];
            } else if (!this._processes[procName]) {
                this._processes[procName] = [this._counter, intervalRef];
            } else {
                this._processes[procName].push([this._counter, intervalRef]);
            }
            return this._counter++;
        } else {
            return callable.apply(null, args);
        }
    };

    this.top = function(resultIsString, topOptions) {
        //TODO: process monitoring
        //TODO: htop-style options
        return;
    };

    this._validateOptions = function(paramString) {
        //ensure that options are of form -[letters] or --word1-word2
        var isValid = /(((^|\s)-[\w]+|--[\w][\w-]+)(\s)?)+$/.test(paramString);
        if (this._devMode && !isValid) {
            console.log(paramString, 'is an invalid option.');
        }
        return isValid;
    };


    this._vectorMap = function(item, mapMethod) {
        if (item instanceof Array) {
            return item.map(mapMethod);
        } else {
            return mapMethod(item);
        }
    };
}

//return function if in a browser, export a module with a new object if in node
if (this['window']) {
    Shell.prototype.environment = window;
} else if (GLOBAL) {
    Shell.prototype.environment = GLOBAL;
    module.exports = Shell;
}
