// TODO: get shell to respect local environment scopes (use apply?)
shell = require('./shell.js');
testHash = {a: [ 1, [ 2 ], { b: [ 3, [ 4, 5 ] ] } ] };
allPass = true;
tests = {
    checkRefs: function() {
        return [4 == shell.reference('testHash.a[2].b[1][0]'), 'array and object referencing'];
    }
};

for (testName in tests) {
    result = tests[testName]();
    //result is equal to [didTestPass, test description]
    if (!result[0]) {
        allPass = false;
        console.log('fail', '-', testName, '-', result[1]);
    }
}

if (allPass) {
    console.log('All tests passed!');
}
