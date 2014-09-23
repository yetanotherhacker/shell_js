//shell.js - a library to treat a JavaScript environment like a unix shell.
//Copyright 2011-2014 by Julius D'souza. Licensed under GPL 3.0.

/* TODOS
TODO: figure out how to do deep copy cleanly in node / get rid of silly jQuery use
*/
Shell = function(){
    this.path = '';
    this.devMode = false;
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
        } else if (this.devMode) {
                console.log('No such object exists.');
        }
    };

    this.cp = function(origin, finish) {
        return this._objScope(finish, this._objScope(origin));
    };

    this._validateOptions = function(paramString) {
        //ensure that options are of form -[letters] or --word1-word2
        if (/(((^|\s)-[\w]+|--[\w][\w-]+)(\s)?)+$/.test(paramString)) {
            return true;
        } else {
            return false;
        }
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
        var self = this,
            mapMethod = function(newEntry, index) {
                var newObj = newEntry.split('.').pop(),
                    context = self._newContext(newEntry),
                    isValidProtoArray = protoObjPath instanceof Array && newObjPath instanceof Array && (protoObjPath.length === newObjPath.length),
                    objCreated;

                if (!context) {
                    return;     //quit if no valid new object can be made
                }

                if (protoObjPath instanceof Array) {
                    if (!isValidProtoArray) {
                        return; //quit if newObj and protoObj array lengths mismatch
                    }                   
                    objCreated = Object.create(self._objScope(protoObjPath[index]));
                } else if (typeof protoObjPath === 'string' && self._objScope(protoObjPath)) {
                    objCreated = Object.create(self._objScope(protoObjPath));
                } else {
                    objCreated = {};
                }

                context[newObj] = objCreated;
            };
        this._vectorMap(newObjPath, mapMethod);
    };

    this._newContext = function(pathString) {
        //ensure that the property to be made doesn't exist yet but is valid
        var parentPath = pathString.split('.'),
            pathEnd = parentPath.pop(),
            context;

        parentPath = parentPath.join('.');
        if (parentPath) {
            context = this._objScope(parentPath);
            if (context[pathEnd] && this.devMode) {
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

    this.pwd = function(isStringResult) {
        var result;
        if (isStringResult) {
            if (!this.path) {
                result = 'this';
            } else {
                result = this.path;
            }
        } else {
            if (!this.path) {
                result = this;
            } else {
                result = this.scope(this.path);
            }
        }
        return result;
    };

    this._reference = function(path) {
        //takes a path string and returns what it refers to if it exists
        var self = this,
            mapMethod = function(entry) {
                var pathArray, varRef, innerRef, outerRef, currentReference,
                    arrayRegex = /\[([^\]]+)\]/g,
                    startRegex = /^(\w+)\[/;
                if (entry) {
                    pathArray = entry.split('.');
                    varRef = self.environment;
                //if next token is an object, shift to it and repeat
                    while ((pathArray.length) && (typeof(varRef) === 'object')) {
                        currentReference = pathArray.shift();
                        innerRef = startRegex.exec(currentReference);
                        innerRef = innerRef && innerRef[1];
                        outerRef = (currentReference.match(arrayRegex) || []).map(function(i){ return i.slice(1, i.length - 1);});
                        varRef = varRef[innerRef || currentReference];
                        while (innerRef && outerRef.length && varRef && varRef[outerRef[0]]) {
                            varRef = varRef[outerRef.shift()];
                        }
                    }
                    return varRef;
                } else {
                    return self.environment;
                }
            };
        return this._vectorMap(path, mapMethod);
    };

    this.rm = function(keyString) {
        var self = this,
            mapMethod = function(key) { self._objScope(key, null, true);};
        this._vectorMap(keyString, mapMethod);
    };

    this.setDevMode = function() {
        this.devMode = true;
    }

    this._vectorMap = function(item, mapMethod) {
        if (item instanceof Array) {
            return item.map(mapMethod);
        } else {
            return mapMethod(item);
        }
    }
}

//return function if in a browser, export a module with a new object if in node
if (this['window']) {
    Shell.prototype.environment = window;
} else if (GLOBAL) {
    Shell.prototype.environment = GLOBAL;
    module.exports = Shell;
}
