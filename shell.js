//Shell.js - a library to treat a JavaScript environment like a unix shell.
//Copyright 2011-2014 by Julius D'souza. Licensed under GPL 3.0
//Currently uses jQuery for deep copy in the cp() function.

Shell = {path: ''};
//Shell.path is of the form 'x.y.z'

//TODO: make the Shell object a function return or an environment-agnostic export
/*(function(obj){
    var exports = this['modules'] && modules['exports'];
    if (exports) {
        //CommonJS module handling
        exports.Shell = obj;
    }
})(Shell);*/

Shell.environment = (this['window'] ? window : GLOBAL);

if (!Shell.environment['Shell']) {
    console.warn('Can\'t access top level objects.');
}
//check for no this['Shell']? and return?
//Shell.environment = this['window'] ? window : GLOBAL;
//GLOBAL for node.js
//window for the browser

Shell.cd = function(objString) {
    var paths = [];
    //change working object (directory)
    //cd() acts like cd ..
    //cd($string) switches to the object
    // -- local scoping followed by global scoping
    if (objString === null) { //default no argument behavior
        if (Shell.path.indexOf('.') === -1) {
            Shell.path = ''; //ensure that path's a string
        } else {
            //move up the object chain: x.y.z -> x.y
            //tokenizes the path by '.' into an array,
            //pops the array and recreates the path string
            paths = Shell.path.split('.');
            paths.pop();
            Shell.path = paths.reduce(function(x, y){ return x.concat('.', y);});
        } } else if (objString === '') {
        Shell.path = ''; //move to the top
    } else if (typeof(Shell.reference(Shell.path + '.' + objString)) === 'object') {
        Shell.path = Shell.path + '.' + objStringj; //move to local object
    } else if (typeof(Shell.reference(objString)) === 'object') {
        Shell.path = objStringj; //move to global object
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
        destinationPathArray = finish.split('.'),
        destinationPathString = '';

    if (Shell.reference(Shell.path + '.' + origin) !==undefined) {
        //check if the string refers to something local
        newObj = Shell.reference(Shell.path + '.' + origin);
    } else if (Shell.reference(origin) !==undefined) {
        //check if the string refers to something global
        newObj = Shell.reference(origin);
    } else {
        return origin + ' doesn\'t exist!';
    }

    //check to see if the parent of the stuff we're copying to exists:
    //(can't copy to a non-existent directory!)
    local = destinationPathArray.pop();
    if (destinationPathArray !== '') {
        destinationPathString = destinationPathArray.reduce(function(x, y){ return x.concat('.', y);});
    }
    if (destinationPathString === '') {
        destinationContext = Shell.reference(Shell.path);
        //a local reference
    } else if (typeof(Shell.reference(Shell.path + '.' + destinationPathString)) === 'object') {
        destinationContext = Shell.reference(Shell.path + '.' + destinationPathString);
        //traverse and create a local reference
    } else if (typeof(Shell.reference(destinationPathString)) === 'object') {
        destinationContext = Shell.reference(destinationPathString);
        //create global reference
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
        //TODO: figure out how to do this cleanly in node
        if (destinationContext[local] === undefined)
            destinationContext[local] = $.extend(true, {}, newObj);
        else
            destinationContext[local] = $.extend(true, destinationContext[local], newObj);
    }
}

Shell.ls = function(key, params) {
    //declare contents of current path's object
    var keyPath = Shell.path + (key ? '.' + key : ''),
        lsMethod = /h/.test(params) ? Object.getOwnPropertyNames : Object.keys,
        currentObj = Shell.reference(keyPath) || {};
    //use Object.getOwnPropertyNames for hidden properties with the 'h' - hidden parameter
    return lsMethod(currentObj).sort();
}

Shell.mkdir = function(newObj, protoObj) {
    //mkdir(newObj) makes an empty object
    //mkdir(newObj, protoObj) makes an object newObj with protoObj as the prototype
    //so newObj inherits protoObj's properties
    //in addition, newObj.proto gives the path to protoObj
    if (protoObj === null) {
        //normal mkdir behavior
        Shell.reference(Shell.path)[newObj] = {};
    } else if (typeof(Shell.reference(Shell.path)[protoObj]) === 'object') {
        //local extension
        Shell.reference(Shell.path)[newObj] = Object.create(Shell.reference(Shell.path)[protoObj]);
        Shell.reference(Shell.path)[newObj].proto = Shell.path + '.' + protoObj;
    } else if (typeof(Shell.reference(protoObj) === 'object')) {
        //global extension
        Shell.reference(Shell.path)[newObj] = Object.create(Shell.reference(protoObj));
        Shell.reference(Shell.path)[newObj].proto = protoObj;
    }
    return newObj;
}

Shell.pwd = function() {
    if (Shell.path === '') {
        return 'top';
    } else {
        return Shell.path;
    }
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

Shell.reload = function() {
    //equivalent to clearing the environment
    //@TODO: determine if this is really needed, this is browser-specific
    location.reload();
}

Shell.rm = function(obj) {
    if (!obj) {
        return;     //do nothing if there's nothing to delete
    } else if (typeof(Shell.reference(Shell.path)[obj]) !== 'undefined') {
        delete Shell.reference(Shell.path)[obj];    //clear local variable
    } else if (typeof(Shell.reference(obj)) !== 'undefined') {
        delete Shell.environment[obj];  //clear out global variable
    }
}
