all : test 

.PHONY : all test

JSHINT=node_modules/.bin/jshint

test : 
	$(JSHINT) bin lib
