// node tests
// TODO: figure out scoping weirdness with 'GLOBAL' and 'this' in node
shell = new (require('./shell.js'))();
shell.setMode('dev', true);
shell.setMode('production', false);

testHash = {
    a: [1, [2], {
            b: [3, [4,5]]
        }]
    };
testsPass = true;
tests = {
    devLogs: function() {
        shell.log('dev', 'test/devLogs', 'Testing logging.');
        return [shell._logs.dev.length, 'Testing devLogs().'];
    },
    mkdirScoping: function() {
        //check global and local scoping via mkdir()
        var passTest = true;
        shell.cd();
        shell.mkdir(['testHashA', 'testHashB']);
        //freshly created objects should be empty
        passTest &= !Object.keys(testHashA).length;
        passTest &= !Object.keys(testHashB).length;
        shell.mkdir('testHashA.c');
        passTest &= Object.keys(testHashA).length === 1;

        shell.cd('testHashA');
        shell.mkdir('d');
        passTest &= Object.keys(testHashA).length === 2;
        shell.mkdir('d.e');
        passTest &= Object.keys(testHashA.d).length === 1;
        shell.mkdir('testHashB.d');
        passTest &= Object.keys(testHashB).length === 1;
        shell.mkdir('testHashB.d.e');
        passTest &= Object.keys(testHashB.d).length === 1;

        shell.cd();
        shell.rm(['testHashA', 'testHashB']);
        return [passTest, 'global and local scoping for mkdir()'];
    },
    mkdirProto: function() {
        var passTest = true;
        shell.cd();
        shell.mkdir('protoTest', 'testHash');
        passTest &= (protoTest.a && protoTest.a[0]) === 1;
        shell.rm('protoTest');
        return [passTest, 'mkdir() prototyping'];
    },
    globalMakeRemove: function() {
        //make and remove in global scope
        var isDirMade, isDirRemoved;
        shell.cd();
        shell.mkdir('emptyTestHash');
        isDirMade = shell._reference()['emptyTestHash'] && !Object.keys(emptyTestHash).length;
        shell.rm('emptyTestHash');
        isDirRemoved = !shell._reference()['emptyTestHash'];
        return [isDirMade && isDirRemoved, 'global make and remove object'];
    },
    lsFilter: function() {
        shell.cd();
        return [shell.ls('*Int*Arr.*').indexOf('Int32Array') > 0, 'cli regex filters'];
    },
    lsOpts: function() {
        var zeroOpt, singleOpt, doubleOpt;
        shell.cd();
        zeroOpt = shell.ls().length;
        singleOpt = shell.ls('', '-a').length;
        doubleOpt = shell.ls('', '--all').length;

        return [(singleOpt === doubleOpt) && (singleOpt > zeroOpt), 'ls() valid opts'];
    },
    lsInvalidOpts: function() {
        shell.cd();
        return [!(shell.ls('', 's').length || shell.ls('--a').length || shell.ls('---').length), 'ls() invalid options']
    },
    rmChecks: function() {
        var passTest = true;
        shell.cd();
        shell.mkdir(['testHashA', 'testHashB']);
        testHashA.a = {b: 3};

        shell.cd('testHashA');
        shell.rm('a.b');
        passTest &= !Object.keys(testHashA.a).length;
        shell.cd('..');
        shell.rm(['testHashA', 'testHashB']);
        passTest &= shell._reference(['testHashA', 'testHashB']).every(function(i) { return !i;});
        return [passTest, 'global and local scoping with rm()'];
    },
    chmodCheck: function() {
        var passTest = true,
            isRead;
        shell.cd();
        shell.mkdir('testHashC');
        shell.chmod(testHashC, '+r');
        isRead = testHashC._chmod['u']['r'];
        shell.rm('testHashC');
        return [isRead, 'chmod() modifier setting'];
    },
    cpChecks: function() {
        var passTest = true;
        shell.cd();
        shell.cp('testHash.a', 'testHash.x');
        passTest = passTest && shell._reference('testHash.x');

        shell.cd('testHash');
        shell.cp('x', 'z');
        passTest = passTest && shell._reference('testHash.z');
        shell.rm(['x', 'z']);
        return [passTest, 'global and local scoping with cp()'];
    },
    checkRefs: function() {
        //simple does reference() work check
        shell.cd();
        return [4 === shell._reference('testHash.a[2].b[1][0]'), 'array and object mixed referencing'];
    }
};

for (testName in tests) {
    result = tests[testName]();
    //result is equal to [didTestPass, test description]
    if (!result[0]) {
        testsPass = false;
        console.log('fail', '-', testName, '-', result[1]);
    }
}

if (testsPass) {
    console.log('All tests passed!');
}
