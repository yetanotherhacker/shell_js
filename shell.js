//Shell.js - a library to treat a JavaScript environment like a unix shell.
//Copyright 2011-2014 by Julius D'souza. Licensed under GPL 3.0.
//Currently uses jQuery for deep copy in the cp() function.

//Shell = {path: ''};
//Shell.path is of the form 'x.y.z'

/* TODOS
TODO: wrap this in a self-executing anonymous function like every js good library
TODO: parse array references properly in reference()
-- It's horrible, but you should be able to "cd(x.y[2].z)"
TODO: figure out how to do deep copy cleanly in node / get rid of silly jQuery dependency
*/

var Shell = (function(){
    var obj = {path: ''},
        exports = this['modules'] && modules['exports'],
        returnObj;
    if (exports) {
        //CommonJS module handling
        exports.Shell = obj;
        return exports.Shell;
    } else {
        this['Shell'] = obj;
        return this['Shell'];
    }
})();

Shell.environment = (this['window'] ? window : GLOBAL);

if (!Shell.environment['Shell']) {
    console.warn('Can\'t access top level objects.');
}

Shell.cd = function(objString) {
    var pathObjects = [];
    //change working object (directory)
    //cd('..') acts like cd ..
    //cd($string) switches to the object
    // -- local scoping followed by global scoping

    if (objString === null) { //default no argument behavior
        return;
    } else if (objString === '') {
        Shell.path = ''; //move to the top
    } else if (objString === '..') {
        //move up the object chain: x.y.z -> x.y
        //tokenizes the path by '.' into an array,
        //pops the array and recreates the path string
        pathObjects = Shell.path.split('.');
        pathObjects.pop();
        if (pathObjects.length) {
            Shell.path = pathObjects.reduce(function(pathChain, pathLink) {
                return pathChain.concat('.', pathLink);
            });
        } else {
            Shell.path = '';
        }
    } else if (typeof(Shell.reference([Shell.path, '.', objString].join(''))) === 'object') {
        Shell.path = [Shell.path, '.', objString].join(''); //move to local object
    } else if (typeof(Shell.reference(objString)) === 'object') {
        Shell.path = objString; //move to global object
    } else {
        return 'No such object exists.';
    }
}

Shell.cp = function(origin, finish) {
    //hard copy from origin to finish
    //slightly hairy, but copying is a hairy operation anyway
    //in a dynamic language with 'interesting' moduling and scoping
    var newObj = '',
        destinationContext = '',
        local = [],
        localPath = [Shell.path, '.', origin].join(''),
        destinationPathArray = finish.split('.'),
        destinationPathString = '';

    if (Shell.reference(localPath) !== undefined) {
        //check if the string refers to something local
        newObj = Shell.reference(localPath);
    } else if (Shell.reference(origin) !== undefined) {
        //check if the string refers to something global
        newObj = Shell.reference(origin);
    } else {
        return origin + ' doesn\'t exist!';
    }

    //check to see if the parent of the what we're copying to exists:
    //(can't copy to a non-existent path!)
    local = destinationPathArray.pop();
    if (destinationPathArray !== '') {
        destinationPathString = destinationPathArray.reduce(function(x, y){ return x.concat('.', y);});
    }

    if (destinationPathString === '') {
        //a local reference
        destinationContext = Shell.reference(Shell.path);
    } else if (typeof(Shell.reference([Shell.path, '.', destinationPathString].join(''))) === 'object') {
        //traverse and create a local reference
        destinationContext = Shell.reference([Shell.path, '.', destinationPathString]);
    } else if (typeof(Shell.reference(destinationPathString)) === 'object') {
        //create global reference
        destinationContext = Shell.reference(destinationPathString);
    } else {
        return destinationPathString + ' is not an object.';
    }

    if ((typeof(newObj) === 'function') || (typeof(newObj) === 'string') || (typeof(newObj) === 'number')) {
        //about everything except objects does copy by value
        //objects do copy by reference
        destinationContext[local] = newObj;
    } else if (typeof(newObj) === 'object') {
        //deep copy's hard due to prototypes and dangling references
        //after chatting around on freenode, I've been convinced
        //that it's hard to beat jQuery's own implementation
        //edit: not so convinced anymore, need to figure out a clean way to do this
        if (destinationContext[local] === undefined) {
            destinationContext[local] = $.extend(true, {}, newObj);
        } else {
            destinationContext[local] = $.extend(true, destinationContext[local], newObj);
        }
    }
}

Shell.validateOptions = function(paramString) {
   if (/(((^|\s)-[\w]+|--[\w-]+)(\s)?)+$/.test(paramString)) {
        return true;
   } else {
        console.warn("invalid option(s)");
        return false;
   }
}

Shell.handleOption = function(singleParams, literalParams) {
    //example usage: Shell.handleOption('[xy]','(--x-option|--y-option)')
    return RegExp('((^|\\s)-[\\w]?' + singleParams + '[\\w]?)|(' + doubleParams + '(\\s|$))'); 
}

Shell.ls = function(key, paramString) {
    //declare contents of current path's object
    //use Object.getOwnPropertyNames for hidden properties with the 'a' parameter
    if (!Shell.validateOptions) {
        return;
    }
    var keyPath = Shell.path + (key ? '.' + key : ''),
        lsMethod = Shell.handleOption('a','--all').test(paramString) ? Object.getOwnPropertyNames : Object.keys,
        currentObj = Shell.reference(keyPath) || {};
    return lsMethod(currentObj).sort();
}

Shell.mkdir = function(newObj, protoObj) {
    //mkdir(newObj) makes an empty object
    //mkdir(newObj, protoObj) makes an object newObj with protoObj as the prototype
    //so newObj inherits protoObj's properties
    //in addition, newObj.proto gives the path to protoObj
    if (typeof(protoObj) === 'undefined') {
        //normal mkdir behavior
        Shell.reference(Shell.path)[newObj] = {};
    } else if (typeof(Shell.reference(Shell.path)[protoObj]) === 'object') {
        //local extension
        Shell.reference(Shell.path)[newObj] = Object.create(Shell.reference(Shell.path)[protoObj]);
        Shell.reference(Shell.path)[newObj].proto = [Shell.path, '.', protoObj].join('');
    } else if (typeof(Shell.reference(protoObj) === 'object')) {
        //global extension
        Shell.reference(Shell.path)[newObj] = Object.create(Shell.reference(protoObj));
        Shell.reference(Shell.path)[newObj].proto = protoObj;
    }
    return newObj;
}

Shell.pwd = function(stringFlag) {
    var result;
    if (stringFlag) {
        if (Shell.path === '') {
            result = 'this';
        } else {
            result = Shell.path;
        }
    } else {
        if (Shell.path === '') {
            result = this;
        } else {
            result = Shell.reference(Shell.path);
        }
    }
    return result;
}

Shell.reference = function(path) {
    //takes a path string and returns what it refers to if it exists
    var pathArray, ref;
    if (path !== '') {
        pathArray = path.split('.');
        ref = Shell.environment;
    //if next token is an object, shift to it and repeat
        while ((pathArray.length) && (typeof(ref) === 'object')) {
            ref = ref[pathArray.shift()];
        }
        return ref;
    } else {
        return Shell.environment;
    }
}

Shell.rm = function(keyString) {
    if (!keyString) {
        //do nothing if there's nothing to delete
        return 'rm: missing operand';
    } else if (typeof(Shell.reference(Shell.path)[keyString]) !== 'undefined') {
        delete Shell.reference(Shell.path)[keyString];    //clear local variable
    } else if (typeof(Shell.reference(keyString)) !== 'undefined') {
        delete Shell.environment[keyString];  //clear out global variable
    } else {
        return 'rm: could not find item';
    }
}
