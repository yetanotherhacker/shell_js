//Shell.js - a library to treat the browser javascript environment like a unix shell.
//Copyright 2011-2012 by Julius D'souza. Licensed under GPL 3.0
//Uses jQuery for the cp() function.
//
Shell = {path:""};
//The path is of the form "x.y.z"

Shell.environment = GLOBAL;
//GLOBAL for node.js
//window for the browser

Shell.cd = function(x)
{
	//change working object (directory)
	//cd() acts like cd ..
	//cd($string) switches to the object
	// -- local scoping followed by global scoping
	if(x==null)	//default no argument behavior
	{
		if(Shell.path.indexOf(".")==-1)
		{
			Shell.path=""; //ensure that path's a string
		}
		else
		{
			//move up the object chain: x.y.z -> x.y
			//tokenizes the path by '.' into an array,
			//pops the array and reforms the path string
			var paths = Shell.path.split(".");
			paths.pop();
			Shell.path = paths.reduce(function(x,y){ return x.concat(".",y);});
		}
	}
	else if(x=="")
	{
		Shell.path=""; //move to the top
	}
	else if(typeof(Shell.reference(Shell.path+"."+x))=="object")
	{
		Shell.path=Shell.path+"."+x; //move to local object
	}
	else if(typeof(Shell.reference(x))=="object")
	{
		Shell.path=x; //move to global object
	}
	else
	{
		return "No such object exists.";
	}
}

Shell.cp = function(x,y)
{
	//hard copy from x to y
	//slightly hairy, but copying is a hairy operation anyway
	//in a dynamic language with "interesting" moduling and scoping
	var X = ''; var Y = '';
	if(Shell.reference(Shell.path+'.'+x)!=undefined)
	{
		//check if the string refers to something local
		X = Shell.reference(Shell.path+'.'+x);
	}
	else if(Shell.reference(x)!=undefined)
	{
		//check if the string refers to something global
		X = Shell.reference(x);
	}
	else
	{
		return x+" doesn't exist!";
	}
	//check to see if the parent of the stuff we're copying to exists:
	//(can't copy to a non-existent directory!)
	var ypaths = y.split(".");
	var yfather = '';
	var yson = ypaths.pop();
	if(ypaths!='')
	{
		yfather = ypaths.reduce(function(x,y){ return x.concat(".",y);});
	}
	if(yfather=='')
	{
		Y = Shell.reference(Shell.path);
		//A local reference
	}
	else if(typeof(Shell.reference(Shell.path+'.'+yfather))=='object')
	{
		Y = Shell.reference(Shell.path+'.'+yfather);
		//Traverse and create a local reference
	}
	else if(typeof(Shell.reference(yfather))=='object')
	{
		Y = Shell.reference(yfather);
		//Create global reference
	}
	else
	{
		return yfather + " is not an object.";
	}
	if((typeof(X)=='function')||(typeof(X)=='string')||(typeof(X)=='number'))
	{
		//about everything except objects does copy by value
		//objects do copy by reference
		Y[yson] = X;
	}
	else if(typeof(X)=='object')
	{
		//deep copy's hard due to prototypes and dangling references
		//after chatting around on freenode, I've been convinced
		//that it's hard to beat jQuery's own implementation
		if(Y[yson]==undefined)
			Y[yson] = $.extend(true, {}, X);
		else
			Y[yson] = $.extend(true, Y[yson], X);
	}
}

Shell.ls = function()
{
	//declare contents of current path's object
	if(Shell.path=="")
		return Object.keys(Shell.environment).sort();
		//use Object.getOwnPropertyNames for hidden properties
	else
		return Object.keys(Shell.reference(Shell.path)).sort();
}

Shell.mkdir = function(son, father)
{
	//mkdir(a) makes an empty object
	//mkdir(a,b) makes an object a with b as the prototype
	//so a inherits b's properties
	//in addition, a.proto gives the path to b
	if(father==null)
	{
		//normal mkdir behavior
		Shell.reference(Shell.path)[son] = {};
	}
	else if(typeof(Shell.reference(Shell.path)[father])=='object')
	{
		//local extension
		Shell.reference(Shell.path)[son] = Object.create(Shell.reference(Shell.path)[father]);
		Shell.reference(Shell.path)[son].proto = Shell.path+"."+father;
	}
	else if(typeof(Shell.reference(father)=='object'))
	{
		//global extension
		Shell.reference(Shell.path)[son] = Object.create(Shell.reference(father));
		Shell.reference(Shell.path)[son].proto = father;
	}
	return son;
}

Shell.pwd = function()
{
	if(Shell.path=="")
		return "top";
	else
		return Shell.path;
}

Shell.reference = function(x)
{
	//takes a path string and returns what it refers to if it exists
	if(x!=='')
	{
		var array_path = x.split(".");
		var ref = Shell.environment;
	//if next token is an object, shift to it and repeat
		while ((array_path.length)&&(typeof(ref)=="object"))
			ref = ref[array_path.shift()];
		return ref;
	}
	else
		return Shell.environment;
}

Shell.reload = function()
{
	//equivalent to clearing the environment
	location.reload();
}

Shell.rm = function(x)	
{
	//do nothing if there's nothing to delete
	if(x==null)		{return;}
	//clear out local variable
	else if(typeof(Shell.reference(Shell.path)[x])!='undefined')
				{delete Shell.reference(Shell.path)[x];}
	//otherwise, clear out global variable
	else if(typeof(Shell.reference(x))!='undefined')
				{delete Shell.environment[x];}
}
