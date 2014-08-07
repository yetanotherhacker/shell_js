//shell.js - a library to treat a JavaScript environment like a unix shell.
//Copyright 2011-2014 by Julius D'souza. Licensed under GPL 3.0.

/* TODOS
TODO: figure out how to do deep copy cleanly in node / get rid of silly jQuery dependency
TODO: return a function wrapping the object like all those nice js libraries
TODO: make a dev. mode option for console warnings
*/
Shell = function(){
    this.path = '';
    //this.path is of the form 'x.y.z'

    this.cd = function(objString) {
        var pathObjects = [];
        //change working object (directory)
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
        } else if (typeof(this.reference([this.path, '.', objString].join(''))) === 'object') {
            this.path = [this.path, '.', objString].join(''); //move to local object
        } else if (typeof(this.reference(objString)) === 'object') {
            this.path = objString; //move to global object
        } else {
            return 'No such object exists.';
        }
    };

    this.cp = function(origin, finish) {
        if (typeof origin !== 'string' || typeof finish !== 'string') {
            return;
        }
        //hard copy from origin to finish
        var newObj = '',
            destinationContext = '',
            local = [],
            localPath = [this.path, '.', origin].join(''),
            destinationPathArray = finish.split('.'),
            destinationPathString = '';

        if (this.reference(localPath) !== undefined) {
            //check if the string refers to something local
            newObj = this.reference(localPath);
        } else if (this.reference(origin) !== undefined) {
            //check if the string refers to something global
            newObj = this.reference(origin);
        } else {
            return origin + ' doesn\'t exist!';
        }

        //check to see if the parent of the what we're copying to exists:
        //(can't copy to a non-existent path!)
        local = destinationPathArray.pop();
        if (destinationPathArray !== []) {
            destinationPathString = destinationPathArray.reduce(function(x, y){ return x.concat('.', y);}, '');
        }

        if (!destinationPathString) {
            //a local reference
            destinationContext = this.reference(this.path);
        } else if (typeof(this.reference([this.path, '.', destinationPathString].join(''))) === 'object') {
            //traverse and create a local reference
            destinationContext = this.reference([this.path, '.', destinationPathString]);
        } else if (typeof(this.reference(destinationPathString)) === 'object') {
            //create global reference
            destinationContext = this.reference(destinationPathString);
        } else {
            return destinationPathString + ' is not an object.';
        }

        if (/(function|number|string)/.test(typeof(newObj))) {
            //about everything except objects does copy by value
            //objects do copy by reference
            destinationContext[local] = newObj;
        } else if (typeof(newObj) === 'object') {
            //deep copy's hard due to prototypes and dangling references
            //after chatting around on freenode, I've been convinced
            //that it's hard to beat jQuery's own implementation
            //edit: not so convinced anymore, need to figure out a clean way to do this
            if (!shell.reference()['jQuery']) {
                return;
            }
            if (!destinationContext[local]) {
                destinationContext[local] = jQuery.extend(true, {}, newObj);
            } else {
                destinationContext[local] = jQuery.extend(true, destinationContext[local], newObj);
            }
        }
    };

    this._validateOptions = function(paramString) {
        //ensure that options are of form -[letters] or --word1-word2
        if (/(((^|\s)-[\w]+|--[\w][\w-]+)(\s)?)+$/.test(paramString)) {
            return true;
        } else {
            //console.warn("invalid option(s)");
            return false;
        }
    };

    this._handleOption = function(singleParams, doubleParams) {
        //example usage: this._handleOption('[xy]','(--x-option|--y-option)')
        return RegExp('((^|\\s)-[\\w]?' + singleParams + '[\\w]?)|(' + doubleParams + '(\\s|$))'); 
    };

    this.ls = function(key, paramString) {
        //declare contents of current path's object
        //use Object.getOwnPropertyNames for hidden properties with the 'a' parameter
        if (paramString && !this._validateOptions(paramString)) {
            return [];
        }
        var keyPath = this.path + (key ? '.' + key : ''),
            lsMethod = this._handleOption('a','--all').test(paramString) ? Object.getOwnPropertyNames : Object.keys,
            currentObj = this.reference(keyPath) || {};
        return lsMethod(currentObj).sort();
    };

    this.mkdir = function(newObj, protoObj) {
        //TODO: move scoping functionality to separate function
        //TODO: figure out overwriting options / what to do if existing entry is not an object
        //mkdir(newObj) makes an empty object
        //mkdir(newObj, protoObj) makes an object newObj with protoObj as the prototype
        //so newObj inherits protoObj's properties
        var globalPathEnvironment = newObj.split('.'),
            globalPathObject = globalPathEnvironment.pop(),
            isLocalObj = this.reference('') !== this.reference(this.path) && !/\./.test(newObj),
            localPathEnvironment = [this.path, newObj].join('.').split('.'),
            localPathObject = localPathEnvironment.pop(),
            objCreated;

        globalPathEnvironment = this.reference(globalPathEnvironment.join('.'));
        localPathEnvironment = this.reference(localPathEnvironment.join('.'));

        if (typeof protoObj === 'string') {
            //TODO fix scoping for prototype object
            //TODO make new .proto property as an option
            //objCreated = Object.create(this.reference(protoObj));
            objCreated = Object.create(this.reference(this.path)[protoObj]);
        } else {
            objCreated = {};
        }

        if (!isLocalObj && typeof(globalPathEnvironment) === 'object' && typeof(this.reference(newObj)) === 'undefined') {
            //global mkdir behaviour
            return globalPathEnvironment[globalPathObject] = objCreated;
        } else if (typeof(localPathEnvironment) === 'object' && typeof(localPathEnvironment[localPathObject]) === 'undefined') {
            //local mkdir behaviour
            return localPathEnvironment[localPathObject] = objCreated;
        }
    };

    this.pwd = function(returnString) {
        var result;
        if (returnString) {
            if (!this.path) {
                result = 'this';
            } else {
                result = this.path;
            }
        } else {
            if (!this.path) {
                result = this;
            } else {
                result = this.reference(this.path);
            }
        }
        return result;
    };

    this.reference = function(path) {
        //takes a path string and returns what it refers to if it exists
        var pathArray, ref, innerRef, outerRef, currentReference,
            arrayRegex = /\[([^\]]+)\]/g,
            startRegex = /^(\w+)\[/;
        if (path) {
            pathArray = path.split('.');
            ref = this.environment;
        //if next token is an object, shift to it and repeat
            while ((pathArray.length) && (typeof(ref) === 'object')) {
                currentReference = pathArray.shift(),
                innerRef = startRegex.exec(currentReference);
                innerRef = innerRef && innerRef[1];
                outerRef = (currentReference.match(arrayRegex) || []).map(function(i){ return i.slice(1, i.length - 1);});
                ref = ref[innerRef || currentReference];
                while (innerRef && outerRef.length && ref && ref[outerRef[0]]) {
                    ref = ref[outerRef.shift()];
                }
            }
            return ref;
        } else {
            return this.environment;
        }
    };

    this.rm = function(keyString) {
        //todo check scoping works
        if (!keyString) {
            //do nothing if there's nothing to delete
            return 'rm: missing operand';
        } else if (typeof(this.reference(this.path)[keyString]) !== 'undefined') {
            delete this.reference(this.path)[keyString];    //clear local variable
        } else if (typeof(this.reference(keyString)) !== 'undefined') {
            delete this.environment[keyString];  //clear out global variable
        } else {
            return 'rm: could not find item';
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
