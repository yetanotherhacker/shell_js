shell = require('./shell.js');
x = {a: [ 1, [ 2 ], { b: [ 3, [ 4, 5 ] ] } ] };
console.log(4 == shell.reference('x.a[2].b[1][0]'), 'array and object referencing');